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
