function doPost(e) {

  try {

    const props = PropertiesService.getScriptProperties();



    const ONESIGNAL_APP_ID = props.getProperty('ONESIGNAL_APP_ID');

    const ONESIGNAL_API_KEY = props.getProperty('ONESIGNAL_API_KEY');

    const ADMIN_UID = props.getProperty('ADMIN_UID');

    const FIREBASE_API_KEY = props.getProperty('FIREBASE_API_KEY');



    const body = JSON.parse(e.postData.contents || '{}');



    if (!body.idToken) {

      return jsonResponse({

        ok: false,

        erro: 'Token não informado.'

      });

    }



    // Valida o usuário no Firebase

    const firebaseResp = UrlFetchApp.fetch(

      'https\://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + FIREBASE_API_KEY,

      {

        method: 'post',

        contentType: 'application/json',

        payload: JSON.stringify({

          idToken: body.idToken

        }),

        muteHttpExceptions: true

      }

    );



    if (firebaseResp.getResponseCode() !== 200) {

      return jsonResponse({

        ok: false,

        erro: 'Usuário não autenticado.'

      });

    }



    const firebaseData = JSON.parse(

      firebaseResp.getContentText()

    );



    const uid =

      firebaseData.users &&

      firebaseData.users[0]

        ? firebaseData.users[0].localId

        : null;



    if (!uid) {

      return jsonResponse({

        ok: false,

        erro: 'UID não encontrado.'

      });

    }



    let destinatarios = [];



    let titulo =

      body.titulo ||

      'MVL – Ministério Vasos de Louvores';



    let mensagem =

      body.mensagem ||

      'Nova notificação do MVL.';



    let url =

      body.url ||

      'https\://robertjuniorrj85-ux.github.io/App-MVL/';



    switch (body.tipo) {



      // =====================================================

      // COMUNICAÇÃO

      // =====================================================



      case 'mensagem_admin':

        destinatarios = [ADMIN_UID];

        break;



      case 'confirmacao_admin': {
        // Destinatários são determinados no servidor: principal e administradores
        // com permissão de escalas. Não confiar em UIDs arbitrários do cliente.
        const adminsPermitidos = mvl94Json_('MVL_ADMIN_PERMS', {});
        destinatarios = [ADMIN_UID].concat(Object.keys(adminsPermitidos).filter(function(adminId) {
          return adminsPermitidos[adminId] && adminsPermitidos[adminId].escalas === true;
        })).filter(function(adminId) { return adminId && adminId !== uid; });
        break;
      }



     // ==================================================

// V10 - FOTO DE PERFIL

// ==================================================



case 'perfil_foto_upload':

case 'perfil_foto_delete': {

  const resultadoFoto = processarFotoPerfilMVL(body, uid);

  return jsonResponse(resultadoFoto);

}



// ==================================================

// V10 - ADMINISTRAÇÃO DE USUÁRIOS

// ==================================================



case 'usuario_reset_senha':

case 'usuario_desativar':

case 'usuario_reativar':

case 'usuario_excluir': {

  const resultadoAdmin = processarAdminUsuarioMVL(body);

  return jsonResponse(resultadoAdmin);

}

      // =====================================================

      // CHAT DA ESCALA

      // =====================================================



      case 'chat_escala':



        if (

          !Array.isArray(body.destinatarios) ||

          body.destinatarios.length === 0

        ) {

          return jsonResponse({

            ok: false,

            erro: 'Destinatários não informados.'

          });

        }



        destinatarios =

          body.destinatarios.filter(

            id => id && id !== uid

          );



        break;



      // =====================================================

      // CENTRAL DE CONVERSAS V11.1.0

      // Chat privado, Chat Geral seletivo e grupos manuais

      // =====================================================

      case 'chat_geral':

        if (
          !Array.isArray(body.destinatarios) ||
          body.destinatarios.length === 0
        ) {
          return jsonResponse({
            ok: false,
            erro: 'Destinatários não informados.'
          });
        }

        // O remetente nunca recebe o próprio push.
        destinatarios =
          body.destinatarios.filter(
            id => id && id !== uid
          );

        break;



      // =====================================================

      // ORAÇÃO V9.6

      // =====================================================



      case 'oracao':



        if (

          !Array.isArray(body.destinatarios) ||

          body.destinatarios.length === 0

        ) {

          return jsonResponse({

            ok: true,

            mensagem: 'Nenhum destinatário necessário.'

          });

        }



        // Quem orou não recebe a própria notificação

        destinatarios =

          body.destinatarios.filter(

            id => id && id !== uid

          );



        break;



      // =====================================================

      // REGISTRO DO DISPOSITIVO PARA PUSH

      // =====================================================

      case 'push_subscription_sync': {

        const sid = String(body.subscriptionId || '').trim();

        if (!sid) return jsonResponse({ok:false, erro:'Subscription ID não informado.'});

        const total = salvarPushSubscriptionMVL_(uid, sid);

        return jsonResponse({ok:true, tipo:'push_subscription_sync', total, registro:'V11.0.0'});

      }



      // =====================================================

      // SINCRONIZAÇÃO DE PERMISSÕES V9.6

      // =====================================================



      case 'admin_perms_sync':



        if (uid !== ADMIN_UID) {

          return jsonResponse({

            ok: false,

            erro: 'Apenas o administrador principal.'

          });

        }



        const totalAdmins =

          salvarPermissoesAdminsMVL(

            body.admins || []

          );



        return jsonResponse({

          ok: true,

          tipo: 'admin_perms_sync',

          total: totalAdmins

        });



      // =====================================================

      // ANIVERSÁRIOS

      // =====================================================



      case 'aniversario_sync':



        if (

          !mvl96Pode_(

            uid,

            'membros',

            ADMIN_UID

          )

        ) {

          return jsonResponse({

            ok: false,

            erro: 'Sem permissão para gerenciar membros.'

          });

        }



        const totalAniversarios =

          salvarAniversariosMVL(

            body.pessoas || []

          );



        return jsonResponse({

          ok: true,

          tipo: 'aniversario_sync',

          total: totalAniversarios

        });



      // =====================================================

      // ESCALAS / ENCONTROS

      // =====================================================



      case 'escala_sync':



        if (

          !mvl96Pode_(

            uid,

            'escalas',

            ADMIN_UID

          )

        ) {

          return jsonResponse({

            ok: false,

            erro: 'Sem permissão para gerenciar escalas.'

          });

        }



        salvarEscalaMVL(

          body.escala || {}

        );



        return jsonResponse({

          ok: true,

          tipo: 'escala_sync'

        });



      case 'escala_delete':



        if (

          !mvl96Pode_(

            uid,

            'escalas',

            ADMIN_UID

          )

        ) {

          return jsonResponse({

            ok: false,

            erro: 'Sem permissão para excluir escalas.'

          });

        }



        excluirEscalaMVL(

          body.escalaId || ''

        );



        return jsonResponse({

          ok: true,

          tipo: 'escala_delete'

        });



      // =====================================================

      // CONFIRMAÇÃO DO PRÓPRIO INTEGRANTE

      // =====================================================



            // CONFIRMAÇÃO DO INTEGRANTE: persiste sem enviar push.
      case 'confirmacao_sync': {
        const escalaId = String(body.escalaId || '');
        const encontroId = String(body.encontroId || '');
        const respostaStatus = String(body.respostaStatus || '');
        const encontrosRespondidos = body.encontros;
        if (!escalaId || !encontroId ||
            !['confirmado', 'nao_posso'].includes(respostaStatus) ||
            !encontrosRespondidos || typeof encontrosRespondidos !== 'object' ||
            Array.isArray(encontrosRespondidos) ||
            encontrosRespondidos[encontroId] !== respostaStatus) {
          return jsonResponse({ok:false, erro:'Dados da confirmação inválidos.'});
        }
        const escalas = mvl94Json_('MVL_ESCALAS', []);
        const escala = escalas.find(function(x) { return String(x.id) === escalaId; });
        if (!escala) return jsonResponse({ok:false, erro:'Escala não encontrada.'});
        const encontro = Array.isArray(escala.encontros)
          ? escala.encontros.find(function(x) { return String(x.id) === encontroId; }) : null;
        if (!encontro) return jsonResponse({ok:false, erro:'Encontro não encontrado na escala.'});
        if (!Array.isArray(escala.integranteIds) || !escala.integranteIds.includes(uid) ||
            !Array.isArray(encontro.integranteIds) || !encontro.integranteIds.includes(uid)) {
          return jsonResponse({ok:false, erro:'Usuário não pertence a este encontro.'});
        }
        const registroSalvo = salvarConfirmacaoEscalaMVL(escalaId, uid, encontrosRespondidos, '');
        if (!registroSalvo) return jsonResponse({ok:false, erro:'Não foi possível salvar a confirmação.'});
        console.log('[MVL CONFIRMACAO SYNC] registro salvo; escala=' + escalaId +
          ' encontro=' + encontroId + ' uid=' + uid + '; push será tratado separadamente.');
        return jsonResponse({
          ok:true, tipo:'confirmacao_sync', registroOk:true, pushAceito:false,
          pushErro:'Push separado para os demais integrantes.'
        });
      }

      // PUSH DA CONFIRMAÇÃO: exclusivamente os demais integrantes do encontro.
      case 'confirmacao_integrantes': {
        const escalaId = String(body.escalaId || '');
        const encontroId = String(body.encontroId || '');
        const respostaStatus = String(body.respostaStatus || '');
        const nomeIntegrante = String(body.nomeIntegrante || '').trim().replace(/[\\r\\n\\t]+/g, ' ').substring(0, 80);
        if (!escalaId || !encontroId || !nomeIntegrante ||
            !['confirmado', 'nao_posso'].includes(respostaStatus)) {
          return jsonResponse({ok:false, erro:'Dados da notificação de confirmação inválidos.'});
        }
        const escalas = mvl94Json_('MVL_ESCALAS', []);
        const escala = escalas.find(function(x) { return String(x.id) === escalaId; });
        if (!escala) return jsonResponse({ok:false, erro:'Escala não encontrada.'});
        const encontro = Array.isArray(escala.encontros)
          ? escala.encontros.find(function(x) { return String(x.id) === encontroId; }) : null;
        if (!encontro) return jsonResponse({ok:false, erro:'Encontro não encontrado na escala.'});
        if (!Array.isArray(escala.integranteIds) || !escala.integranteIds.includes(uid) ||
            !Array.isArray(encontro.integranteIds) || !encontro.integranteIds.includes(uid)) {
          return jsonResponse({ok:false, erro:'Usuário não pertence a este encontro.'});
        }
        const confirmacaoSalva = escala.confirmacoes && escala.confirmacoes[uid];
        const statusSalvo = confirmacaoSalva && confirmacaoSalva.encontros
          ? confirmacaoSalva.encontros[encontroId] : '';
        if (statusSalvo !== respostaStatus) {
          return jsonResponse({ok:false, erro:'A confirmação correspondente ainda não foi sincronizada; push não enviado.'});
        }
        destinatarios = [...new Set(encontro.integranteIds.filter(function(id) {
          return id && id !== uid;
        }))];
        if (!destinatarios.length) {
          return jsonResponse({
            ok:true, tipo:'confirmacao_integrantes', pushAceito:false,
            totalDestinatarios:0, totalSubscriptions:0,
            erro:'Não há outros integrantes neste encontro.'
          });
        }
        const nomeEncontro = String(encontro.nome || escala.evento || 'encontro da escala').substring(0,150);
        mensagem = respostaStatus === 'confirmado'
          ? nomeIntegrante + ' confirmou presença em ' + nomeEncontro + '.'
          : nomeIntegrante + ' informou que não poderá participar de ' + nomeEncontro + '.';
        const resultadoPush = enviarPushSubscriptionsMVL_(
          destinatarios, 'Resposta de escala', mensagem,
          'https://robertjuniorrj85-ux.github.io/App-MVL/'
        );
        console.log('[MVL CONFIRMACAO INTEGRANTES] escala=' + escalaId +
          ' encontro=' + encontroId + ' destinatarios=' + destinatarios.length +
          ' pushAceito=' + !!resultadoPush.ok +
          ' subscriptions=' + (resultadoPush.totalSubscriptions || 0));
        return jsonResponse({
          ok:true, tipo:'confirmacao_integrantes', pushAceito:!!resultadoPush.ok,
          totalDestinatarios:destinatarios.length,
          totalSubscriptions:resultadoPush.totalSubscriptions || 0,
          erro:resultadoPush.ok ? '' : (resultadoPush.erro || 'OneSignal não confirmou o envio.')
        });
      }

      case 'confirmacao_sync_admin':



        if (

          !mvl96Pode_(

            uid,

            'escalas',

            ADMIN_UID

          )

        ) {

          return jsonResponse({

            ok: false,

            erro: 'Sem permissão para gerenciar escalas.'

          });

        }



        salvarConfirmacaoEscalaMVL(

          body.escalaId || '',

          body.usuarioId || '',

          body.encontros || {},

          body.status || ''

        );



        return jsonResponse({

          ok: true,

          tipo: 'confirmacao_sync_admin'

        });



      // =====================================================

      // PUSH DE ESCALA

      // =====================================================



      case 'escala':



        if (

          !mvl96Pode_(

            uid,

            'escalas',

            ADMIN_UID

          )

        ) {

          return jsonResponse({

            ok: false,

            erro: 'Sem permissão para enviar escala.'

          });

        }



        if (

          !Array.isArray(body.destinatarios) ||

          !body.destinatarios.length

        ) {

          return jsonResponse({

            ok: false,

            erro: 'Destinatários não informados.'

          });

        }



        destinatarios =

          body.destinatarios;



        break;



      // =====================================================

      // PUSH DE AGENDA

      // =====================================================



      case 'agenda':



        if (

          !mvl96Pode_(

            uid,

            'agenda',

            ADMIN_UID

          )

        ) {

          return jsonResponse({

            ok: false,

            erro: 'Sem permissão para agenda.'

          });

        }



        if (

          !Array.isArray(body.destinatarios) ||

          !body.destinatarios.length

        ) {

          return jsonResponse({

            ok: false,

            erro: 'Destinatários não informados.'

          });

        }



        destinatarios =

          body.destinatarios;



        break;



      // =====================================================

      // PUSH DE AVISOS

      // =====================================================



      case 'aviso':



        if (

          !mvl96Pode_(

            uid,

            'avisos',

            ADMIN_UID

          )

        ) {

          return jsonResponse({

            ok: false,

            erro: 'Sem permissão para avisos.'

          });

        }



        if (

          !Array.isArray(body.destinatarios) ||

          !body.destinatarios.length

        ) {

          return jsonResponse({

            ok: false,

            erro: 'Destinatários não informados.'

          });

        }



        destinatarios =

          body.destinatarios;



        break;



      default:



        return jsonResponse({

          ok: false,

          erro: 'Tipo de notificação inválido.'

        });

    }



    // Remove duplicados

    destinatarios = [

      ...new Set(

        destinatarios.filter(Boolean)

      )

    ];



    if (!destinatarios.length) {

      return jsonResponse({

        ok: true,

        mensagem:

          'Nenhum destinatário necessário.'

      });

    }



    // =====================================================

    // V10.5.0 - PUSH IMEDIATO DE ESCALA POR INTEGRANTE

    // Envia cada UID separadamente para que uma subscription problemática

    // de um integrante não interfira na entrega aos demais.

    // =====================================================

    if (body.tipo === 'escala') {

      const resultadosEscala = destinatarios.map(function(destUid) {

        const r = enviarPushSubscriptionsMVL_([destUid], titulo, mensagem, url);

        console.log('[MVL ESCALA V11.0.0] uid=' + destUid + ' resultado=' + JSON.stringify(r));

        return { uid: destUid, ok: !!r.ok, status: r.status || 0, totalSubscriptions: r.totalSubscriptions || 0, erro: r.erro || '' };

      });



      const entregues = resultadosEscala.filter(function(r) { return r.ok; }).length;

      return jsonResponse({

        ok: entregues > 0,

        tipo: 'escala',

        modo: 'individual_por_uid',

        totalDestinatarios: resultadosEscala.length,

        enviosAceitos: entregues,

        resultados: resultadosEscala

      });

    }



    // =====================================================

    // V11.2 - CENTRAL DE CONVERSAS: envio isolado por UID + diagnóstico

    // Uma subscription problemática não pode impedir o push dos demais.

    // =====================================================

    // V11.4.10 - ORAÇÃO: envio individual, como nas escalas.
    // Preserva a gravação da oração e o fluxo dos demais tipos de push.
    if (body.tipo === 'oracao') {
      const resultadosOracao = destinatarios.map(function(destUid) {
        const subscriptionsAntes = resolverPushSubscriptionsMVL_([destUid]);
        let r;
        try {
          r = enviarPushSubscriptionsMVL_([destUid], titulo, mensagem, url);
        } catch (erroEnvio) {
          r = {ok:false, status:0, erro:String(erroEnvio)};
        }
        const item = {
          uid: destUid,
          ok: !!r.ok,
          status: r.status || 0,
          totalSubscriptions: r.totalSubscriptions || subscriptionsAntes.length || 0,
          erro: r.erro || (r.resposta && r.resposta.errors ? JSON.stringify(r.resposta.errors) : ''),
          oneSignalId: r.resposta && r.resposta.id ? String(r.resposta.id) : ''
        };
        registrarDiagnosticoPushMVL_('oracao', uid, item);
        console.log('[MVL ORACAO] uid=' + destUid + ' ok=' + item.ok + ' status=' + item.status + ' inscricoes=' + item.totalSubscriptions + ' erro=' + item.erro);
        return item;
      });
      const aceitosOracao = resultadosOracao.filter(function(r) { return r.ok; }).length;
      return jsonResponse({
        ok: aceitosOracao > 0,
        tipo: 'oracao',
        modo: 'individual_por_uid',
        totalDestinatarios: resultadosOracao.length,
        enviosAceitos: aceitosOracao,
        resultados: resultadosOracao
      });
    }

    if (body.tipo === 'chat_geral') {
      const resultadosChat = destinatarios.map(function(destUid) {
        const subscriptionsAntes = resolverPushSubscriptionsMVL_([destUid]);
        const r = enviarPushSubscriptionsMVL_([destUid], titulo, mensagem, url);
        const item = {
          uid: destUid,
          ok: !!r.ok,
          status: r.status || 0,
          totalSubscriptions: r.totalSubscriptions || subscriptionsAntes.length || 0,
          erro: r.erro || '',
          oneSignalId: r.resposta && r.resposta.id ? String(r.resposta.id) : ''
        };
        registrarDiagnosticoPushMVL_('chat_geral', uid, item);
        return item;
      });

      const aceitosChat = resultadosChat.filter(function(r) { return r.ok; }).length;
      return jsonResponse({
        ok: aceitosChat > 0,
        tipo: 'chat_geral',
        modo: 'individual_por_uid',
        totalDestinatarios: resultadosChat.length,
        enviosAceitos: aceitosChat,
        resultados: resultadosChat
      });
    }

    // =====================================================

    // ONESIGNAL - envio por Subscription ID

    // =====================================================

    const subscriptionIds = resolverPushSubscriptionsMVL_(destinatarios);

    if (body.tipo === 'escala') console.log('[MVL DIAG ESCALA] totalSubscriptionsResolvidas=' + subscriptionIds.length);

    if (!subscriptionIds.length) {

      return jsonResponse({

        ok: false,

        erro: 'Nenhum dispositivo com push registrado para os destinatários.',

        destinatariosSemSubscription: destinatarios

      });

    }



    const oneSignalPayload = {

      app_id: ONESIGNAL_APP_ID,

      include_subscription_ids: subscriptionIds,

      headings: { en: titulo, pt: titulo },

      contents: { en: mensagem, pt: mensagem },

      url: url

    };



    const oneSignalResp = UrlFetchApp.fetch(

      'https\://api.onesignal.com/notifications',

      {

        method: 'post',

        contentType: 'application/json',

        headers: { Authorization: 'Key ' + ONESIGNAL_API_KEY },

        payload: JSON.stringify(oneSignalPayload),

        muteHttpExceptions: true

      }

    );



    let status = oneSignalResp.getResponseCode();

    let resposta = oneSignalResp.getContentText();

    let parsed = {};

    try { parsed = JSON.parse(resposta || '{}'); } catch (_) {}

    if (body.tipo === 'escala') {

      console.log('[MVL DIAG ESCALA] OneSignal status=' + status);

      console.log('[MVL DIAG ESCALA] OneSignal resposta=' + JSON.stringify(parsed));

    }



    // V10.5.0 - limpa IDs antigos/inválidos e tenta novamente apenas com os válidos.

    const invalidas = parsed && parsed.errors && Array.isArray(parsed.errors.invalid_player_ids)

      ? parsed.errors.invalid_player_ids.map(String).filter(Boolean)

      : [];



    let idsFinais = subscriptionIds.slice();

    if (invalidas.length) {

      removerPushSubscriptionsInvalidasMVL_(invalidas);

      idsFinais = idsFinais.filter(id => !invalidas.includes(String(id)));



      if (idsFinais.length) {

        const retryPayload = Object.assign({}, oneSignalPayload, {

          include_subscription_ids: idsFinais

        });

        const retryResp = UrlFetchApp.fetch(

          'https\://api.onesignal.com/notifications',

          {

            method: 'post',

            contentType: 'application/json',

            headers: { Authorization: 'Key ' + ONESIGNAL_API_KEY },

            payload: JSON.stringify(retryPayload),

            muteHttpExceptions: true

          }

        );

        status = retryResp.getResponseCode();

        resposta = retryResp.getContentText();

        parsed = {};

        try { parsed = JSON.parse(resposta || '{}'); } catch (_) {}

        if (body.tipo === 'escala') {

          console.log('[MVL DIAG ESCALA] retry status=' + status);

          console.log('[MVL DIAG ESCALA] retry resposta=' + JSON.stringify(parsed));

        }

      } else {

        return jsonResponse({

          ok: false,

          erro: 'As subscriptions dos destinatários estavam inválidas e foram removidas.',

          invalidasRemovidas: invalidas.length

        });

      }

    }



    const temErro = !!parsed.errors;

    return jsonResponse({

      ok: status >= 200 && status < 300 && !temErro,

      status,

      resposta: parsed,

      totalSubscriptions: idsFinais.length,

      invalidasRemovidas: invalidas.length

    });



  } catch (erro) {



    return jsonResponse({

      ok: false,

      erro: String(erro)

    });

  }

}





// =========================================================

// MAPA UID -> SUBSCRIPTIONS ONESIGNAL - V10.5.0 (registro limpo)

// =========================================================

function pushMapMVL_() {

  const props = PropertiesService.getScriptProperties();

  try { return JSON.parse(props.getProperty('MVL_PUSH_SUBSCRIPTIONS_V105') || '{}') || {}; }

  catch (_) { return {}; }

}



function salvarPushSubscriptionMVL_(uid, sid) {

  uid = String(uid || '').trim();

  sid = String(sid || '').trim();

  if (!uid || !sid) throw new Error('UID/Subscription ID inválido.');



  // Serializa alterações do mapa para não perder inscrições quando
  // dois integrantes entram no aplicativo ao mesmo tempo.
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
  const props = PropertiesService.getScriptProperties();
  const mapa = pushMapMVL_();





  // Um Subscription ID pertence a apenas um UID. Se o navegador/PWA trocou

  // de usuário, removemos o mesmo ID de qualquer vínculo anterior.

  Object.keys(mapa).forEach(function(outroUid) {

    const lista = Array.isArray(mapa[outroUid]) ? mapa[outroUid] : [];

    const limpa = lista.filter(function(x) { return x && String(x) !== sid; });

    if (limpa.length) mapa[outroUid] = limpa;

    else delete mapa[outroUid];

  });



  const atual = Array.isArray(mapa[uid]) ? mapa[uid] : [];

  mapa[uid] = [sid].concat(atual.filter(function(x) { return x && String(x) !== sid; })).slice(0, 5);

  props.setProperty('MVL_PUSH_SUBSCRIPTIONS_V105', JSON.stringify(mapa));

  return mapa[uid].length;

  } finally { lock.releaseLock(); }
}



// V10.5.0 - remove Subscription IDs que o OneSignal informou como inválidos.

// Isso evita que inscrições antigas de navegador/PWA continuem quebrando os lembretes.

function removerPushSubscriptionsInvalidasMVL_(invalidIds) {

  invalidIds = Array.isArray(invalidIds) ? invalidIds.map(String).filter(Boolean) : [];

  if (!invalidIds.length) return 0;



  const props = PropertiesService.getScriptProperties();

  const mapa = pushMapMVL_();

  const invalidas = new Set(invalidIds);

  let removidas = 0;



  Object.keys(mapa).forEach(uid => {

    const atuais = Array.isArray(mapa[uid]) ? mapa[uid] : [];

    const validas = atuais.filter(sid => {

      const remover = sid && invalidas.has(String(sid));

      if (remover) removidas++;

      return !remover;

    });



    if (validas.length) mapa[uid] = validas;

    else delete mapa[uid];

  });



  props.setProperty('MVL_PUSH_SUBSCRIPTIONS_V105', JSON.stringify(mapa));

  return removidas;

}



function resolverPushSubscriptionsMVL_(uids) {

  const mapa = pushMapMVL_();

  const ids = [];

  (uids || []).forEach(uid => (Array.isArray(mapa[uid]) ? mapa[uid] : []).forEach(sid => {

    if (sid && !ids.includes(sid)) ids.push(sid);

  }));

  return ids;

}

function enviarPushSubscriptionsMVL_(uids, titulo, mensagem, url) {

  const props = PropertiesService.getScriptProperties();

  let ids = resolverPushSubscriptionsMVL_(uids);

  if (!ids.length) return {ok:false, erro:'Nenhuma subscription registrada.'};



  function enviar_(subscriptionIds) {

    const payload = {

      app_id: props.getProperty('ONESIGNAL_APP_ID'),

      include_subscription_ids: subscriptionIds,

      headings: {en:titulo, pt:titulo},

      contents: {en:mensagem, pt:mensagem},

      url: url || 'https\://robertjuniorrj85-ux.github.io/App-MVL/'

    };

    const resp = UrlFetchApp.fetch('https\://api.onesignal.com/notifications',{

      method:'post', contentType:'application/json',

      headers:{Authorization:'Key '+props.getProperty('ONESIGNAL_API_KEY')},

      payload:JSON.stringify(payload), muteHttpExceptions:true

    });

    let body={}; try{body=JSON.parse(resp.getContentText()||'{}');}catch(_){}

    return {status:resp.getResponseCode(), resposta:body};

  }



  let resultado = enviar_(ids);

  const invalidas = resultado.resposta && resultado.resposta.errors &&

    Array.isArray(resultado.resposta.errors.invalid_player_ids)

      ? resultado.resposta.errors.invalid_player_ids.map(String).filter(Boolean)

      : [];



  if (invalidas.length) {

    removerPushSubscriptionsInvalidasMVL_(invalidas);

    ids = ids.filter(id => !invalidas.includes(String(id)));

    if (ids.length) resultado = enviar_(ids);

    else return {

      ok:false,

      erro:'As subscriptions registradas estavam inválidas e foram removidas.',

      invalidasRemovidas:invalidas.length

    };

  }



  const temErro = !!(resultado.resposta && resultado.resposta.errors);

  return {

    ok:resultado.status>=200 && resultado.status<300 && !temErro,

    status:resultado.status,

    resposta:resultado.resposta,

    totalSubscriptions:ids.length,

    invalidasRemovidas:invalidas.length

  };

}



// =========================================================

// MANUTENÇÃO / DIAGNÓSTICO PUSH V11.0.0

// =========================================================

function diagnosticoPushMVL_V105() {

  const mapa = pushMapMVL_();

  const resumo = Object.keys(mapa).map(function(uid) {

    return {uid: uid, dispositivos: Array.isArray(mapa[uid]) ? mapa[uid].length : 0};

  });

  console.log(JSON.stringify({versao:'11.0.0', usuarios:resumo.length, resumo:resumo}));

  return resumo;

}



function limparRegistroPushMVL_V105() {

  // Execute manual e conscientemente apenas se desejar forçar novo cadastro

  // de TODOS os aparelhos. A V10.5.0 já usa uma propriedade nova e limpa,

  // portanto esta função normalmente não precisa ser executada.

  PropertiesService.getScriptProperties().deleteProperty('MVL_PUSH_SUBSCRIPTIONS_V105');

  console.log('Registro V10.5.0 de push limpo. Os aparelhos deverão abrir o app novamente.');

}



// =========================================================

// STATUS DO SERVIÇO

// =========================================================



function doGet() {



  return jsonResponse({

    ok: true,

    servico: 'MVL Notificações',

    status: 'online',

    versao: '11.0.0'

  });

}





// =========================================================

// RESPOSTA JSON

// =========================================================



function jsonResponse(obj) {



  return ContentService

    .createTextOutput(

      JSON.stringify(obj)

    )

    .setMimeType(

      ContentService.MimeType.JSON

    );

}





// =========================================================
// DIAGNÓSTICO DE PUSH V11.2
// Mantém somente os últimos 80 eventos, sem armazenar mensagem nem token.
// =========================================================
function registrarDiagnosticoPushMVL_(tipo, remetenteUid, resultado) {
  try {
    const props = PropertiesService.getScriptProperties();
    let logs = [];
    try { logs = JSON.parse(props.getProperty('MVL_PUSH_DIAGNOSTICO_V112') || '[]') || []; } catch (_) {}
    logs.push({
      quando: new Date().toISOString(),
      tipo: String(tipo || ''),
      remetenteUid: String(remetenteUid || ''),
      destinatarioUid: String(resultado && resultado.uid || ''),
      ok: !!(resultado && resultado.ok),
      status: Number(resultado && resultado.status || 0),
      totalSubscriptions: Number(resultado && resultado.totalSubscriptions || 0),
      erro: String(resultado && resultado.erro || ''),
      oneSignalId: String(resultado && resultado.oneSignalId || '')
    });
    props.setProperty('MVL_PUSH_DIAGNOSTICO_V112', JSON.stringify(logs.slice(-80)));
  } catch (e) {
    console.log('[MVL PUSH DIAG] falha ao registrar: ' + String(e));
  }
}

function diagnosticoPushMVL_V112() {
  const props = PropertiesService.getScriptProperties();
  const mapa = pushMapMVL_();
  let logs = [];
  try { logs = JSON.parse(props.getProperty('MVL_PUSH_DIAGNOSTICO_V112') || '[]') || []; } catch (_) {}
  const usuarios = Object.keys(mapa).map(function(uid) {
    return { uid: uid, subscriptions: Array.isArray(mapa[uid]) ? mapa[uid].length : 0 };
  });
  const resultado = { usuarios: usuarios, ultimosEventos: logs.slice(-30) };
 console.log(JSON.stringify({
  totalEventos: logs.length,
  ultimosEventos: logs.slice(-5)
}, null, 2));
  return resultado;
}

// =========================================================

// TESTE ONESIGNAL

// =========================================================



function testarOneSignalAdmin() {

  const props = PropertiesService.getScriptProperties();

  const adminUid = props.getProperty('ADMIN_UID');

  const ids = resolverPushSubscriptionsMVL_([adminUid]);

  if (!ids.length) {

    console.log('Nenhum Subscription ID registrado para o administrador.');

    return;

  }

  const resultado = enviarPushSubscriptionsMVL_(

    [adminUid],

    'Teste MVL',

    'Teste automático do Apps Script.',

    'https\://robertjuniorrj85-ux.github.io/App-MVL/'

  );

  console.log(JSON.stringify(resultado));

}


// Diagnóstico somente leitura: quantidade de dispositivos registrados por UID.
// Não dispara push, não altera propriedades e não expõe IDs de inscrição.
function diagnosticarVinculosPushMVL_V11410() {
  const mapa = pushMapMVL_();
  const resumo = Object.keys(mapa).map(function(uid) {
    const ids = Array.isArray(mapa[uid]) ? mapa[uid] : [];
    return {uid: uid, totalInscricoes: ids.length};
  });
  console.log(JSON.stringify({totalUsuarios:resumo.length, usuarios:resumo}, null, 2));
  return resumo;
}

// V11.4.10 - MANUTENCAO SEGURA DE INSCRICOES ANTIGAS
// Esta rotina NAO e executada automaticamente e NAO envia push.
// Apenas a inscricao identificada como Unsubscribed no painel OneSignal
// pode ser retirada, mediante execucao manual da funcao de limpeza.
// A rotina preserva todas as demais inscricoes, inclusive as do celular atual.
function diagnosticarInscricaoAntigaJuniorMVL_V11410() {
  const uid = '92sbLqRDicMRQidmfL1yEqk4jnX2';
  const sidAntigo = '5a37df69-5631-4dd3-b383-6d27dc1c5111';
  const mapa = pushMapMVL_();
  const lista = Array.isArray(mapa[uid]) ? mapa[uid] : [];
  const resultado = {
    usuario: 'Junior',
    inscricoesRegistradas: lista.length,
    inscricaoAntigaPresente: lista.includes(sidAntigo),
    outrasInscricoesPreservadas: lista.filter(function(sid) { return sid !== sidAntigo; }).length,
    acao: 'somente_diagnostico'
  };
  console.log(JSON.stringify(resultado, null, 2));
  return resultado;
}

// EXECUCAO MANUAL OPCIONAL. Nao execute antes de confirmar que
// a inscricao indicada permanece Unsubscribed no painel OneSignal.
// Remove somente o ID especifico, nunca limpa todos os dispositivos.
function removerInscricaoAntigaJuniorMVL_V11410() {
  const uid = '92sbLqRDicMRQidmfL1yEqk4jnX2';
  const sidAntigo = '5a37df69-5631-4dd3-b383-6d27dc1c5111';
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const props = PropertiesService.getScriptProperties();
    const mapa = pushMapMVL_();
    const lista = Array.isArray(mapa[uid]) ? mapa[uid] : [];
    if (!lista.includes(sidAntigo)) {
      const resultado = {ok:true, removidas:0, motivo:'Inscricao antiga nao consta no cadastro', restantes:lista.length};
      console.log(JSON.stringify(resultado));
      return resultado;
    }
    // Backup recuperavel do mapa antes da alteracao.
    const backupKey = 'MVL_PUSH_BACKUP_ANTES_LIMPEZA_JUNIOR_V11410';
    props.setProperty(backupKey, JSON.stringify(mapa));
    const restantes = lista.filter(function(sid) { return sid !== sidAntigo; });
    if (restantes.length) mapa[uid] = restantes;
    else delete mapa[uid];
    props.setProperty('MVL_PUSH_SUBSCRIPTIONS_V105', JSON.stringify(mapa));
    const resultado = {ok:true, removidas:1, restantes:restantes.length, backup:backupKey};
    console.log(JSON.stringify(resultado));
    return resultado;
  } finally {
    lock.releaseLock();
  }
}