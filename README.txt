MVL 9.1 - CORREÇÕES E PUSH

CORRIGIDO
- Integrante pode salvar nome e função em Meu Perfil.
- Integrante pode enviar mensagem privada à liderança.
- Integrante pode confirmar presença ou informar que não poderá participar.
- Mensagens de erro aparecem quando o Firestore bloqueia alguma ação.
- Registro do aparelho no Firebase Cloud Messaging.
- Chave pública VAPID já configurada.
- Service worker separado para receber notificações FCM em segundo plano.
- Token do aparelho salvo em:
  usuarios/{UID}/dispositivos/{ID}

PASSOS PARA ATUALIZAR
1. Substitua os arquivos do repositório App-MVL pelos arquivos deste pacote.
2. Firebase > Firestore > Regras.
3. Copie TODO o conteúdo de FIRESTORE_RULES_V9_1.txt.
4. Clique em Publicar.
5. Abra:
   https://robertjuniorrj85-ux.github.io/App-MVL/index.html?v=9.1
6. No celular do integrante:
   - entre no MVL;
   - abra Notificações;
   - toque em Permitir notificações;
   - aceite a permissão do navegador.

IMPORTANTE SOBRE PUSH
A V9.1 agora REGISTRA os celulares corretamente no FCM e consegue RECEBER push.
Porém, para o MVL ENVIAR automaticamente uma notificação FCM para os tokens ao criar uma escala/agenda,
é necessário um backend seguro, como Firebase Cloud Functions.

Não coloque chave privada ou credencial de servidor no GitHub.

A caixa de notificações do próprio MVL continua funcionando normalmente.
