MVL V9.2

Principais mudanças:
- Correções estruturais da V9.1.
- Removido Firebase Messaging do front-end.
- OneSignal Web Push preparado com App ID já configurado.
- Service worker OneSignal separado em /push/onesignal/ para não conflitar com o PWA.
- ID do PWA fixo (/App-MVL/) para futuras versões.
- Notificações internas agora usam um documento por destinatário e consulta segura por UID.
- Confirmação/recusa de escala gera aviso interno para administrador(es).
- Mensagem privada de integrante gera aviso interno para administrador(es).
- Chat exclusivo por escala, com avisos internos para participantes.
- Repertório clicável com músicas, cantor, tom, cifra, link para ouvir e multitrack.
- Uma música pode ter várias versões por cantor/tom.
- Cifra por link do Google Drive.
- Escala pode abrir diretamente repertório e chat.
- Edição de músicas, repertórios, escalas e agenda.
- Exclusão de escala limpa confirmações e chat.

IMPORTANTE:
1. Substitua os arquivos do repositório GitHub pelos desta pasta.
2. Publique as regras FIRESTORE_RULES_V9_2.txt no Firestore.
3. No OneSignal, em Web Settings > Advanced Push Settings, use:
   Path to service worker files: /App-MVL/push/onesignal/
   Service worker filename: OneSignalSDKWorker.js
   Service worker registration scope: /App-MVL/push/onesignal/
4. O recebimento/assinatura OneSignal está pronto. O disparo automático de push para outro usuário ainda precisa de um emissor seguro (backend/webhook). A chave REST do OneSignal NÃO deve ser colocada no GitHub Pages.
