# Revisão de autorização — notificações e confirmações (proposta V9.3)

## Escopo
Esta revisão cobre as gravações em `notificacoes`, a confirmação em `escalas/{escalaId}/confirmacoes/{uid}` e o chat de escala. A proposta mantém o fluxo de push externo separado do Firestore.

## Matriz de cenários

| Cenário | Resultado esperado | Controle |
|---|---|---|
| Integrante confirma presença na própria escala | Permitir gravar a própria confirmação | UID autenticado igual ao UID do documento; status permitido |
| Integrante informa que não poderá participar | Permitir gravar a própria confirmação | Mesma regra de confirmação |
| Integrante cria notificação para si mesmo | Negar | destinatarioId diferente do remetente |
| Integrante notifica outro integrante da mesma escala | Permitir somente tipo confirmacao_escala, com escalaId/refId/encontroId | remetente e destinatário precisam pertencer à escala |
| Integrante tenta notificar administrador pelo fluxo confirmacao_escala | Negar | targetIsAdmin negado nesse ramo |
| Integrante tenta notificar usuário fora da escala | Negar | destinatário precisa constar em escalas/{id}.integranteIds |
| Integrante tenta criar notificação administrativa/genérica | Negar | tipo não autorizado no ramo de integrante |
| Integrante envia chat_escala | Preservar acesso existente, limitado a integrantes da escala | remetente e destinatário precisam pertencer à escala |
| Administrador cria notificação | Preservar | ramo admin |
| Destinatário marca sua notificação como lida | Permitir somente alterar lida/lidaEm | affectedKeys restrito |
| Destinatário tenta alterar mensagem, remetente ou destinatário | Negar | affectedKeys restrito |
| Integrante tenta excluir notificação | Negar | delete somente admin |
| Integrante confirma e tenta enviar push para administradores | Não usar o fluxo de integrantes | Apps Script continua determinando destinatários de confirmacao_admin |
| Administrador confirma | Manter fluxo administrativo separado; não notificar integrantes | Apps Script/cliente preservam chamadas separadas |

## Limitação importante do modelo atual
O documento de escala contém `encontros` como uma lista de mapas, cada um com seu próprio `integranteIds`. As regras atuais não têm uma forma segura e simples de percorrer essa lista e provar que o destinatário pertence especificamente ao `encontroId` informado. Por isso, esta proposta garante que remetente e destinatário pertençam à mesma escala, enquanto o frontend seleciona somente `enc.integranteIds` do encontro. Não declarar essa regra como prova de autorização por encontro.

Para garantir também no servidor que o destinatário pertence ao encontro exato, será necessário normalizar a associação em documentos consultáveis por ID (por exemplo, subcoleção de participantes por encontro) ou mover a criação da notificação para backend confiável que valide a associação. Essa mudança de modelo/backend fica fora desta correção mínima.

## Validação antes de publicar
- Executar Firebase Emulator Suite / Rules Unit Testing para todos os cenários acima.
- Confirmar o formato real de `escalas/{id}.integranteIds` nos dados atuais antes de publicar.
- Confirmar que contas com role `admin_limited` não devem ser tratadas como administradores de destino neste fluxo; a regra atual considera role exatamente `admin`, preservando a semântica existente.
- Não publicar esta proposta até conferir qual conjunto de regras está ativo no projeto Firebase.

## Publicação
Este repositório não contém `firebase.json`, `.firebaserc` nem um arquivo canônico `firestore.rules`. O arquivo `FIRESTORE_RULES_V9_3_PROPOSTA.txt` é documentação de proposta, não deploy automático. Merge no GitHub não altera as regras ativas do Firebase.
