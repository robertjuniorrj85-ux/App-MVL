MVL 9.0

PRINCIPAIS NOVIDADES
- Meu Perfil
- Troca de senha
- Troca obrigatória de senha para novos usuários cujo documento tenha mustChangePassword = true
- Escalas com seleção de integrantes
- Confirmação de presença / não poderei participar
- Repertório usando músicas cadastradas
- Agenda com destinatários e lembretes
- Calendário mensal interativo
- Comunicação privada com a liderança
- Caixa de notificações dentro do MVL
- Aviso somente para pessoas escaladas
- "Minha próxima escala" na página inicial
- Rodapé: Desenvolvido por Robert Junior © 2026
- Regras de segurança revisadas

COMO ATUALIZAR
1. Extraia o ZIP.
2. Substitua os arquivos na raiz do repositório App-MVL.
3. Aguarde o GitHub Pages atualizar.
4. Abra:
   https://robertjuniorrj85-ux.github.io/App-MVL/index.html?v=9.0

MUITO IMPORTANTE - REGRAS DO FIRESTORE
Depois de atualizar o app, abra Firebase > Firestore > Regras.
Copie todo o conteúdo do arquivo FIRESTORE_RULES_V9.txt e publique.

NOVOS USUÁRIOS
Você continua criando o usuário em Firebase > Authentication.
No primeiro login, se ainda não existir documento em usuarios/{UID}, o MVL cria:
role = member
mustChangePassword = true
Isso força o integrante a escolher uma nova senha.

NOTIFICAÇÕES
A V9 possui:
- caixa de notificações dentro do MVL;
- solicitação de permissão de notificação do navegador;
- lembretes locais enquanto o app estiver aberto/ativo.

Para receber PUSH agendado com o aplicativo totalmente fechado (por exemplo, exatamente 3 horas antes),
ainda é necessário configurar Firebase Cloud Messaging + uma função agendada no servidor.
Essa etapa não foi ativada porque precisa de configuração adicional no Firebase/Cloud.
