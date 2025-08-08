/*const socket = io();

const form = document.getElementById('form');
const input = document.getElementById('input');
const messages = document.getElementById('messages');

let username = localStorage.getItem('username');
if (!username) {
  alert('You must be logged in.');
  window.location.href = '/login';
}

let loadedMessagesCount = 0;
const MESSAGES_BATCH_SIZE = 50;
let isLoadingHistory = false;

form.addEventListener('submit', (e) => {
  e.preventDefault();
  if (input.value && username) {
    socket.emit('chat message', { username, message: input.value });
    input.value = '';
    input.focus();
  } else {
    alert('Please enter a message');
  }
});

socket.on('chat history', (msgs) => {
  loadedMessagesCount = msgs.length;
  msgs.forEach(data => appendMessage(data));
  scrollToBottom();
});

socket.on('user connected', (username) => {
  const item = document.createElement('li');
  item.innerHTML = `<em>${username} joined the chat</em>`;
  item.style.textAlign = 'center';
  item.style.fontStyle = 'italic';
  item.classList.add('status');
  messages.appendChild(item);
  scrollToBottom();
});

socket.on('chat message', (data) => {
  const item = document.createElement('li');

  if (data.type === 'status') {
    item.innerHTML = `<em>${data.message}</em>`;
    item.style.textAlign = 'center';
    item.style.fontStyle = 'italic';
    item.classList.add('status');
  } else {
    item.textContent = `${data.username}: ${data.message}`;
  }

  messages.appendChild(item);
  scrollToBottom();
});

socket.on('user disconnected', (username) => {
  const item = document.createElement('li');
  item.innerHTML = `<em>${username} left the chat</em>`;
  item.style.textAlign = 'center';
  item.style.fontStyle = 'italic';
  item.classList.add('status');
  messages.appendChild(item);
  scrollToBottom();
});

function appendMessage(data) {
  const item = document.createElement('li');

  if (data.type === 'status') {
    item.innerHTML = `<em>${data.message}</em>`;
    item.style.textAlign = 'center';
    item.style.fontStyle = 'italic';
    item.classList.add('status');
  } else {
    item.textContent = `${data.username}: ${data.message}`;
  }

  messages.appendChild(item);
}

function prependMessages(msgs) {
  const oldScrollHeight = messages.scrollHeight;

  msgs.forEach(data => {
    const item = document.createElement('li');

    if (data.type === 'status') {
      item.innerHTML = `<em>${data.message}</em>`;
      item.style.textAlign = 'center';
      item.style.fontStyle = 'italic';
      item.classList.add('status');
    } else {
      item.textContent = `${data.username}: ${data.message}`;
    }

    messages.insertBefore(item, messages.firstChild);
  });

  messages.scrollTop = messages.scrollHeight - oldScrollHeight;
}

messages.addEventListener('scroll', async () => {
  if (messages.scrollTop === 0 && !isLoadingHistory) {
    isLoadingHistory = true;
    try {
      const res = await fetch(`/messages?skip=${loadedMessagesCount}`);
      if (res.ok) {
        const olderMessages = await res.json();
        if (olderMessages.length > 0) {
          loadedMessagesCount += olderMessages.length;
          prependMessages(olderMessages);
        }
      }
    } catch (err) {
      console.error('Failed to load older messages', err);
    }
    isLoadingHistory = false;
  }
});

function scrollToBottom() {
  messages.scrollTop = messages.scrollHeight;
}*/

const socket = io();

const form = document.getElementById('form');
const input = document.getElementById('input');
const messages = document.getElementById('messages');

let username = localStorage.getItem('username');
if (!username) {
  alert('You must be logged in.');
  window.location.href = '/login';
}

function createMessageElement(data) {
  const item = document.createElement('li');
  item.dataset.id = data._id || ''; // unique message id (important)

  if (data.type === 'status') {
    item.innerHTML = `<em>${data.message}</em>`;
    item.style.textAlign = 'center';
    item.style.fontStyle = 'italic';
    item.classList.add('status');
  } else {
    item.textContent = `${data.username}: ${data.message}`;

    if (data.username === username) {
      // Edit button
      const editBtn = document.createElement('button');
      editBtn.textContent = 'Edit';
      editBtn.style.marginLeft = '10px';
      editBtn.onclick = () => editMessage(data._id, item);

      // Delete button
      const delBtn = document.createElement('button');
      delBtn.textContent = 'Delete';
      delBtn.style.marginLeft = '5px';
      delBtn.onclick = () => deleteMessage(data._id, item);

      item.appendChild(editBtn);
      item.appendChild(delBtn);
    }
  }

  return item;
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  if (input.value && username) {
    socket.emit('chat message', { username, message: input.value });
    input.value = '';
    input.focus();
  } else {
    alert('Please enter a message');
  }
});

socket.on('chat history', (msgs) => {
  loadedMessagesCount = msgs.length;
  msgs.forEach(data => {
    const msgEl = createMessageElement(data);
    messages.appendChild(msgEl);
  });
  scrollToBottom();
});

socket.on('chat message', (data) => {
  const msgEl = createMessageElement(data);
  messages.appendChild(msgEl);
  scrollToBottom();
});

// Socket listeners for edited and deleted messages:
socket.on('message edited', (updatedMsg) => {
  const item = [...messages.children].find(li => li.dataset.id === updatedMsg._id);
  if (item) {
    // Update text while keeping buttons intact
    item.firstChild.nodeValue = `${updatedMsg.username}: ${updatedMsg.message}`;
  }
});

socket.on('message deleted', (id) => {
  const item = [...messages.children].find(li => li.dataset.id === id);
  if (item) item.remove();
});

// Edit message function
async function editMessage(id, itemElement) {
  const currentText = itemElement.firstChild.nodeValue.split(': ').slice(1).join(': '); // extract message text
  const newMessage = prompt('Edit your message:', currentText);
  if (newMessage === null || newMessage.trim() === '') return;

  try {
    const res = await fetch(`/messages/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, newMessage }),
    });

    if (res.ok) {
      const updatedMsg = await res.json();
      itemElement.firstChild.nodeValue = `${updatedMsg.username}: ${updatedMsg.message}`;
    } else {
      alert('Failed to edit message');
    }
  } catch (err) {
    console.error(err);
  }
}

// Delete message function
async function deleteMessage(id, itemElement) {
  if (!confirm('Are you sure you want to delete this message?')) return;

  try {
    const res = await fetch(`/messages/${id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username }),
    });

    if (res.ok) {
      itemElement.remove();
    } else {
      alert('Failed to delete message');
    }
  } catch (err) {
    console.error(err);
  }
}

function scrollToBottom() {
  messages.scrollTop = messages.scrollHeight;
}
