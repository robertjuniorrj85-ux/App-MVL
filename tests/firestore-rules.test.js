const fs = require('node:fs');
const path = require('node:path');
const {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails
} = require('@firebase/rules-unit-testing');
const { doc, getDoc, getDocs, setDoc, updateDoc, collection, Timestamp } = require('firebase/firestore');

const projectId = 'demo-app-mvl-rules';
let testEnv;

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: {
      rules: fs.readFileSync(
        path.join(__dirname, '..', 'FIRESTORE_RULES_V9_3_PROPOSTA.txt'),
        'utf8'
      )
    }
  });
});

after(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, 'escalas/scale-1'), {
      integranteIds: ['member-a', 'member-b', 'member-c']
    });
    for (const id of ['enc-1', 'enc-2']) {
      await setDoc(doc(db, `escalas/scale-1/encontros/${id}`), { id });
    }
    for (const [uid, encounterId] of [
      ['member-a', 'enc-1'],
      ['member-c', 'enc-1'],
      ['member-b', 'enc-2']
    ]) {
      await setDoc(doc(db, `escalas/scale-1/encontros/${encounterId}/participantes/${uid}`), {
        uid, escalaId: 'scale-1', encontroId: encounterId
      });
    }
    await setDoc(
      doc(db, 'escalas/scale-1/encontros/enc-1/confirmacoes/member-c'),
      confirmation('member-c', 'enc-1', 'confirmado')
    );
    await setDoc(
      doc(db, 'escalas/scale-1/encontros/enc-2/confirmacoes/member-b'),
      confirmation('member-b', 'enc-2', 'nao_posso')
    );
    await setDoc(
      doc(db, 'escalas/scale-1/confirmacoes/member-a'),
      { usuarioId: 'member-a', status: 'confirmado', encontros: {'enc-1': 'confirmado'} }
    );
    await setDoc(doc(db, 'usuarios/admin'), {
      role: 'admin', adminPrincipal: true
    });
  });
});

function confirmation(uid, encounterId, status) {
  return {
    usuarioId: uid,
    usuarioNome: uid,
    escalaId: 'scale-1',
    encontroId: encounterId,
    status,
    atualizadoEm: Timestamp.now()
  };
}

describe('confirmações isoladas por encontro', () => {
  it('permite criar a própria resposta no encontro do usuário', async () => {
    const db = testEnv.authenticatedContext('member-a').firestore();
    await assertSucceeds(setDoc(
      doc(db, 'escalas/scale-1/encontros/enc-1/confirmacoes/member-a'),
      confirmation('member-a', 'enc-1', 'confirmado')
    ));
  });

  it('permite ler as respostas dos colegas do mesmo encontro', async () => {
    const db = testEnv.authenticatedContext('member-a').firestore();
    await assertSucceeds(getDoc(
      doc(db, 'escalas/scale-1/encontros/enc-1/confirmacoes/member-c')
    ));
    await assertSucceeds(getDocs(
      collection(db, 'escalas/scale-1/encontros/enc-1/confirmacoes')
    ));
  });

  it('nega leitura de confirmações de outro encontro da mesma escala', async () => {
    const db = testEnv.authenticatedContext('member-a').firestore();
    await assertFails(getDoc(
      doc(db, 'escalas/scale-1/encontros/enc-2/confirmacoes/member-b')
    ));
    await assertFails(getDocs(
      collection(db, 'escalas/scale-1/encontros/enc-2/confirmacoes')
    ));
  });

  it('permite atualizar a própria resposta sem afetar outros encontros', async () => {
    await testEnv.withSecurityRulesDisabled(async context => {
      await setDoc(
        doc(context.firestore(), 'escalas/scale-1/encontros/enc-1/confirmacoes/member-a'),
        confirmation('member-a', 'enc-1', 'confirmado')
      );
    });
    const db = testEnv.authenticatedContext('member-a').firestore();
    await assertSucceeds(updateDoc(
      doc(db, 'escalas/scale-1/encontros/enc-1/confirmacoes/member-a'),
      {status: 'nao_posso', atualizadoEm: Timestamp.now()}
    ));
  });

  it('nega gravar em encontro no qual o usuário não participa', async () => {
    const db = testEnv.authenticatedContext('member-a').firestore();
    await assertFails(setDoc(
      doc(db, 'escalas/scale-1/encontros/enc-2/confirmacoes/member-a'),
      confirmation('member-a', 'enc-2', 'confirmado')
    ));
  });

  it('nega alterar resposta de outro integrante', async () => {
    const db = testEnv.authenticatedContext('member-a').firestore();
    await assertFails(updateDoc(
      doc(db, 'escalas/scale-1/encontros/enc-1/confirmacoes/member-c'),
      {status: 'nao_posso'}
    ));
  });

  it('nega respostas no caminho legado para integrantes comuns', async () => {
    const db = testEnv.authenticatedContext('member-a').firestore();
    await assertFails(getDoc(doc(db, 'escalas/scale-1/confirmacoes/member-a')));
    await assertFails(setDoc(
      doc(db, 'escalas/scale-1/confirmacoes/member-a'),
      {usuarioId: 'member-a', status: 'confirmado'}
    ));
  });

  it('permite ao gestor ler confirmações de encontros distintos', async () => {
    const db = testEnv.authenticatedContext('admin').firestore();
    await assertSucceeds(getDoc(
      doc(db, 'escalas/scale-1/encontros/enc-2/confirmacoes/member-b')
    ));
  });

  it('nega status fora dos valores aceitos', async () => {
    const db = testEnv.authenticatedContext('member-a').firestore();
    await assertFails(setDoc(
      doc(db, 'escalas/scale-1/encontros/enc-1/confirmacoes/member-a'),
      confirmation('member-a', 'enc-1', 'talvez')
    ));
  });
});


describe('scale chat notifications', () => {
  async function seedLimitedChatAdmin() {
    await testEnv.withSecurityRulesDisabled(async context => {
      await setDoc(doc(context.firestore(), 'usuarios/admin-chat'), {
        role: 'admin_limited',
        adminPrincipal: false,
        adminPermissions: {chats: true}
      });
      await setDoc(doc(context.firestore(), 'usuarios/outsider'), {role: 'member'});
    });
  }

  function chatNotification(to, from = 'member-a') {
    return {
      destinatarioId: to,
      remetenteId: from,
      tipo: 'chat_escala',
      refId: 'scale-1',
      titulo: 'Chat',
      mensagem: 'Nova mensagem'
    };
  }

  it('allows a member to notify the principal chat administrator', async () => {
    const db = testEnv.authenticatedContext('member-a').firestore();
    await assertSucceeds(setDoc(doc(db, 'notificacoes/chat-admin'), chatNotification('admin')));
  });

  it('allows a member to notify a limited administrator with chat permission', async () => {
    await seedLimitedChatAdmin();
    const db = testEnv.authenticatedContext('member-a').firestore();
    await assertSucceeds(setDoc(doc(db, 'notificacoes/chat-limited'), chatNotification('admin-chat')));
  });

  it('denies a notification to an outsider', async () => {
    await seedLimitedChatAdmin();
    const db = testEnv.authenticatedContext('member-a').firestore();
    await assertFails(setDoc(doc(db, 'notificacoes/chat-outsider'), chatNotification('outsider')));
  });

  it('allows a chat administrator to notify a scale member', async () => {
    const db = testEnv.authenticatedContext('admin').firestore();
    await assertSucceeds(setDoc(doc(db, 'notificacoes/chat-manager'), chatNotification('member-a', 'admin')));
  });
});



describe('other notification flows', () => {
  async function seedNotificationFixtures() {
    await testEnv.withSecurityRulesDisabled(async context => {
      const db = context.firestore();
      await setDoc(doc(db, 'usuarios/member-a'), {role: 'member'});
      await setDoc(doc(db, 'usuarios/member-b'), {role: 'member'});
      await setDoc(doc(db, 'usuarios/admin-com'), {
        role: 'admin_limited',
        adminPrincipal: false,
        adminPermissions: {comunicacao: true}
      });
      await setDoc(doc(db, 'usuarios/limited-messages'), {
        role: 'admin_limited',
        adminPrincipal: false,
        adminPermissions: {mensagens: true}
      });
      await setDoc(doc(db, 'conversas/conversation-1'), {
        tipo: 'privado',
        participanteIds: ['member-a', 'member-b'],
        moderadorIds: []
      });
      await setDoc(doc(db, 'notificacoes/read-test'), {
        destinatarioId: 'member-a',
        remetenteId: 'admin',
        titulo: 'Aviso',
        mensagem: 'Teste',
        tipo: 'oracao',
        refId: '',
        lida: false,
        criadoEm: Timestamp.now()
      });
    });
  }

  function notification(to, from, type, refId = '') {
    return {
      destinatarioId: to,
      remetenteId: from,
      titulo: 'Aviso',
      mensagem: 'Teste',
      tipo: type,
      refId
    };
  }

  it('allows a scale manager to notify a scale participant', async () => {
    const db = testEnv.authenticatedContext('admin').firestore();
    await assertSucceeds(setDoc(
      doc(db, 'notificacoes/scale-notice'),
      notification('member-a', 'admin', 'escala', 'scale-1')
    ));
  });

  it('allows a conversation participant to notify another participant', async () => {
    await seedNotificationFixtures();
    const db = testEnv.authenticatedContext('member-a').firestore();
    await assertSucceeds(setDoc(
      doc(db, 'notificacoes/conversation-notice'),
      notification('member-b', 'member-a', 'conversa', 'conversation-1')
    ));
  });

  it('allows a member to notify a communication administrator about a message', async () => {
    await seedNotificationFixtures();
    const db = testEnv.authenticatedContext('member-a').firestore();
    await assertSucceeds(setDoc(
      doc(db, 'notificacoes/message-notice'),
      notification('admin-com', 'member-a', 'mensagem')
    ));
  });

  it('allows an admin without communication permission to notify leadership', async () => {
    await seedNotificationFixtures();
    const db = testEnv.authenticatedContext('limited-messages').firestore();
    await assertSucceeds(setDoc(
      doc(db, 'notificacoes/limited-message-notice'),
      notification('admin-com', 'limited-messages', 'mensagem')
    ));
  });

  it('allows a member to notify an existing user about a prayer', async () => {
    await seedNotificationFixtures();
    const db = testEnv.authenticatedContext('member-a').firestore();
    await assertSucceeds(setDoc(
      doc(db, 'notificacoes/prayer-notice'),
      notification('member-b', 'member-a', 'oracao')
    ));
  });

  it('allows a recipient to update only read fields', async () => {
    await seedNotificationFixtures();
    const db = testEnv.authenticatedContext('member-a').firestore();
    await assertSucceeds(updateDoc(
      doc(db, 'notificacoes/read-test'),
      {lida: true, lidaEm: Timestamp.now()}
    ));
  });

  it('denies a recipient changing protected notification content', async () => {
    await seedNotificationFixtures();
    const db = testEnv.authenticatedContext('member-a').firestore();
    await assertFails(updateDoc(
      doc(db, 'notificacoes/read-test'),
      {mensagem: 'Alterada'}
    ));
  });
});
