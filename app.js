async function sendChat(scale) {
  const input = $('chat-input');
  const mensagem = input.value.trim();

  if (!mensagem) return;

  input.value = '';

  try {
    await addDoc(
      collection(db, 'escalas', scale.id, 'chat'),
      {
        autorId: currentUser.uid,
        autorNome: currentUserData.nome || currentUser.email,
        mensagem,
        criadoEm: serverTimestamp()
      }
    );

    const recipients = [
      ...(scale.integranteIds || []),
      ...usersCache
        .filter(u => u.role === 'admin')
        .map(u => u.id)
    ].filter(
      (v, i, a) =>
        v !== currentUser.uid &&
        a.indexOf(v) === i
    );

    if (recipients.length) {
      createNotifications(
        recipients,
        `Chat • ${scale.evento}`,
        `${currentUserData.nome || currentUser.email}: ${mensagem.slice(0, 120)}`,
        'chat_escala',
        scale.id
      ).catch(erro => {
        console.error('Falha na notificação interna do chat:', erro);
      });
    }

  } catch (e) {
    console.error(e);
    alert('Não foi possível enviar a mensagem.');
  }
}
