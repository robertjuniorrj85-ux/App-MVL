# Revisão de autorização — notificações e confirmações por encontro (V11.4.21)

## Escopo
Esta revisão parte do conjunto completo de regras fornecido pelo responsável do projeto (390 linhas), preservando as permissões existentes e alterando apenas os pontos necessários para restringir notificações e provar a participação no encontro exato.

## Modelo de participação por encontro
O documento principal `escalas/{escalaId}` continua mantendo o campo `encontros` como lista de mapas e cada encontro continua com seu `integranteIds`. Para permitir autorização verificável pelas regras, a aplicação também mantém a associação normalizada em:

`escalas/{escalaId}/encontros/{encontroId}` e `escalas/{escalaId}/encontros/{encontroId}/participantes/{uid}`

O documento de índice do encontro contém `id`, `nome`, `data` e `horario`. A subcoleção `participantes` contém documentos com `uid`, `escalaId`, `encontroId` e `atualizadoEm`; o ID do documento é o UID do integrante.

A sincronização é executada pelo fluxo administrativo de salvar/editar a escala. Ao abrir a área de escalas com permissão de gestão, a aplicação também reconcilia as escalas existentes: cria/atualiza somente índices de encontro divergentes, cria vínculos ausentes, remove participantes que já não constam naquele encontro e limpa subcoleções de encontros removidos. A rotina não altera os documentos de escala nem as confirmações existentes.

## Matriz de cenários

| Cenário | Resultado esperado | Controle |
|---|---|---|
| Gestor autorizado cria/edita escala | Permitir sincronizar vínculos de participantes por encontro | `hasPermission('escalas')`; campos de vínculo conferidos |
| Integrante pertence ao encontro | Permitir consultar o próprio vínculo | UID do documento igual ao UID autenticado |
| Integrante confirma presença ou informa indisponibilidade | Permitir gravar a própria confirmação | UID autenticado igual ao documento; `encontroId` precisa apontar para vínculo existente no encontro exato |
| Integrante tenta confirmar encontro do qual não participa | Negar | Ausência de `participantes/{uid}` para aquele `encontroId` |
| Integrante cria notificação de confirmação para outro integrante do mesmo encontro | Permitir | Remetente e destinatário precisam ter vínculo no mesmo encontro |
| Integrante tenta notificar participante de outro encontro da mesma escala | Negar | A regra verifica a subcoleção do encontro exato, não apenas `escalas/{id}.integranteIds` |
| Integrante tenta notificar administrador pelo fluxo de confirmação | Negar | O ramo de confirmação exige vínculo de participante e o fluxo administrativo permanece separado |
| Integrante envia notificação de chat de escala | Permitir somente entre integrantes da escala | Ambos precisam constar em `integranteIds` da escala |
| Gestor autorizado envia aviso de nova escala | Permitir somente aos integrantes da escala | `hasPermission('escalas')` e destinatário no documento da escala |
| Participante de conversa recebe notificação | Permitir somente entre participantes da conversa | Remetente e destinatário precisam constar em `participanteIds` |
| Integrante envia mensagem à liderança | Permitir notificação somente a administrador com permissão de comunicação | Papel e permissões do destinatário conferidos |
| Integrante registra oração e notifica o ministério | Permitir para UID de usuário existente | Tipo `oracao` e documento do destinatário existente |
| Destinatário marca notificação como lida | Permitir somente alterar `lida` e `lidaEm` | `affectedKeys()` restrito |
| Destinatário tenta alterar mensagem, remetente ou destinatário | Negar | Campos protegidos não podem ser alterados |
| Admin principal e admins limitados | Preservar regras e permissões já existentes | Helpers originais mantidos |

## Compatibilidade e migração
- O formato legado de `escalas/{id}.encontros` é mantido.
- `integranteIds` no documento principal continua existindo para compatibilidade com consultas, chat e lembretes atuais.
- Confirmações continuam no caminho `escalas/{escalaId}/confirmacoes/{uid}`; o campo `encontroId` identifica o encontro da operação que está sendo gravada.
- Nenhuma confirmação ou escala é apagada pela rotina de sincronização.
- A migração é progressiva: escalas existentes são reconciliadas quando um gestor com permissão abre a área de escalas ou salva uma escala. Antes dessa reconciliação, notificações/confirmacões que dependem do vínculo normalizado podem ser negadas. O gestor deve abrir a área e aguardar a sincronização antes de testar o fluxo.
- A rotina não deve ser executada por integrantes comuns.

## Limites de validação
- A proposta foi comparada com o arquivo completo de regras enviado e mantém os blocos de usuários, mensagens, conversas, chat, reações, agenda, repertórios, músicas, cifras, avisos, arquivos, links, membros, orações e configurações.
- Não foi executado Firebase Emulator / Rules Unit Testing nesta etapa; portanto, esta alteração ainda não é certificada para publicação.
- A sintaxe do JavaScript deve ser verificada separadamente; isso não substitui testes com Firebase Emulator nem teste funcional com contas de perfis diferentes.
- O arquivo de regras é uma proposta para revisão manual. Não existe publicação automática via GitHub neste repositório e nenhuma regra foi enviada ao Firebase Console.

## Publicação
Não publicar antes de:
1. Validar a sintaxe das regras no Firebase Rules Playground/Emulator.
2. Testar integrante do encontro, integrante de outro encontro da mesma escala, administrador principal e administrador limitado.
3. Confirmar a sincronização de participantes de todas as escalas existentes.
4. Testar todos os tipos de notificação listados acima e as funcionalidades preservadas.
