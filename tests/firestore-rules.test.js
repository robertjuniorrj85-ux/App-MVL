const fs = require('node:fs');
const path = require('node:path');
const {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails
} = require('@firebase/rules-unit-testing');
const { doc, setDoc, updateDoc, Timestamp } = require('firebase/firestore');

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
      integranteIds: ['member-a', 'member-b']
    });
    await setDoc(doc(db, 'escalas/scale-1/encontros/enc-1'), { id: 'enc-1' });
    await setDoc(doc(db, 'escalas/scale-1/encontros/enc-1/participantes/member-a'), {
      uid: 'member-a', escalaId: 'scale-1', encontroId: 'enc-1'
    });
    await setDoc(doc(db, 'escalas/scale-1/encontros/enc-2'), { id: 'enc-2' });
    await setDoc(doc(db, 'escalas/scale-1/encontros/enc-2/participantes/member-b'), {
      uid: 'member-b', escalaId: 'scale-1', encontroId: 'enc-2'
    });
  });
});

function confirmation(uid, encounterId, status, answers = {[encounterId]: status}) {
  return {
    usuarioId: uid,
    usuarioNome: uid,
    encontroId: encounterId,
    status,
    encontros: answers,
    atualizadoEm: Timestamp.now()
  };
}

describe('confirmações de encontro', () => {
  it('permite criar a própria resposta no encontro do usuário', async () => {
    const db = testEnv.authenticatedContext('member-a').firestore();
    await assertSucceeds(setDoc(
      doc(db, 'escalas/scale-1/confirmacoes/member-a'),
      confirmation('member-a', 'enc-1', 'confirmado')
    ));
  });

  it('nega criação com resposta adicional de outro encontro', async () => {
    const db = testEnv.authenticatedContext('member-a').firestore();
    await assertFails(setDoc(
      doc(db, 'escalas/scale-1/confirmacoes/member-a'),
      confirmation('member-a', 'enc-1', 'confirmado', {
        'enc-1': 'confirmado',
        'enc-2': 'nao_posso'
      })
    ));
  });

  it('permite atualizar a resposta do encontro autorizado e preserva as demais', async () => {
    await testEnv.withSecurityRulesDisabled(async context => {
      await setDoc(
        doc(context.firestore(), 'escalas/scale-1/confirmacoes/member-a'),
        confirmation('member-a', 'enc-1', 'confirmado', {
          'enc-1': 'confirmado',
          'enc-2': 'nao_posso'
        })
      );
    });
    const db = testEnv.authenticatedContext('member-a').firestore();
    await assertSucceeds(updateDoc(
      doc(db, 'escalas/scale-1/confirmacoes/member-a'),
      {
        encontroId: 'enc-1',
        status: 'nao_posso',
        encontros: {'enc-1': 'nao_posso', 'enc-2': 'nao_posso'},
        atualizadoEm: Timestamp.now()
      }
    ));
  });

  it('nega alteração de resposta em outro encontro no mesmo mapa', async () => {
    await testEnv.withSecurityRulesDisabled(async context => {
      await setDoc(
        doc(context.firestore(), 'escalas/scale-1/confirmacoes/member-a'),
        confirmation('member-a', 'enc-1', 'confirmado')
      );
    });
    const db = testEnv.authenticatedContext('member-a').firestore();
    await assertFails(updateDoc(
      doc(db, 'escalas/scale-1/confirmacoes/member-a'),
      {
        encontroId: 'enc-1',
        status: 'nao_posso',
        encontros: {'enc-1': 'nao_posso', 'enc-2': 'confirmado'},
        atualizadoEm: Timestamp.now()
      }
    ));
  });

  it('nega resposta para encontro do qual o usuário não participa', async () => {
    const db = testEnv.authenticatedContext('member-a').firestore();
    await assertFails(setDoc(
      doc(db, 'escalas/scale-1/confirmacoes/member-a'),
      confirmation('member-a', 'enc-2', 'confirmado')
    ));
  });

  it('nega status fora dos valores aceitos', async () => {
    const db = testEnv.authenticatedContext('member-a').firestore();
    await assertFails(setDoc(
      doc(db, 'escalas/scale-1/confirmacoes/member-a'),
      confirmation('member-a', 'enc-1', 'talvez')
    ));
  });
});
