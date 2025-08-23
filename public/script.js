const socket = io();

const form = document.getElementById('form');
const input = document.getElementById('input');
const messages = document.getElementById('messages');

let username = localStorage.getItem('username');
if (!username) {
  alert('You must be logged in.');
  window.location.href = '/login';
}

function formatTimestamp(timestamp) {
  if (!timestamp) return '';
  
  const messageDate = new Date(timestamp);
  const now = new Date();
  const isToday = messageDate.toDateString() === now.toDateString();
  
  if (isToday) {
    return messageDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } else {
    return messageDate.toLocaleDateString([], { hour: '2-digit', minute: '2-digit',day: '2-digit', month: 'short', year: 'numeric' });
  }
}

function createMessageElement(data) {
  const item = document.createElement('li');
  item.dataset.id = data._id || '';

  if (data.type === 'status' || data.username === null) {

    item.innerHTML = `<em>${data.message}</em>`;
    item.style.textAlign = 'center';
    item.style.fontStyle = 'italic';
    item.classList.add('status');
  } else {
    const messageContainer = document.createElement('div');
    messageContainer.className = 'message-container';
    
    const messageHeader = document.createElement('div');
    messageHeader.className = 'message-header';
    
    const usernameSpan = document.createElement('span');
    usernameSpan.className = 'username';
    usernameSpan.textContent = data.username;
    
    const timestampSpan = document.createElement('span');
    timestampSpan.className = 'timestamp';
    timestampSpan.textContent = formatTimestamp(data.timestamp);
    
    messageHeader.appendChild(usernameSpan);
    messageHeader.appendChild(timestampSpan);
    
    const messageContent = document.createElement('div');
    messageContent.className = 'message-content';
    messageContent.textContent = data.message;
    
    messageContainer.appendChild(messageHeader);
    messageContainer.appendChild(messageContent);
    
    item.appendChild(messageContainer);

    if (data.username === username) {
      const buttonContainer = document.createElement('div');
      buttonContainer.className = 'message-buttons';
      buttonContainer.style.display = 'none';
      
      const editBtn = document.createElement('button');
      editBtn.textContent = 'Edit';
      editBtn.onclick = (e) => {
        e.stopPropagation();
        editMessage(data._id, item);
        buttonContainer.style.display = 'none';
      };

      const delBtn = document.createElement('button');
      delBtn.textContent = 'Delete';
      delBtn.onclick = (e) => {
        e.stopPropagation();
        deleteMessage(data._id, item);
        buttonContainer.style.display = 'none';
      };

      buttonContainer.appendChild(editBtn);
      buttonContainer.appendChild(delBtn);
      
      item.appendChild(buttonContainer);

      item.addEventListener('contextmenu', (e) => {
        e.preventDefault();

        document.querySelectorAll('.message-buttons').forEach(btn => {
          btn.style.display = 'none';
        });

        document.body.appendChild(buttonContainer);
        buttonContainer.style.display = 'flex';
        buttonContainer.style.zIndex = '9999';
        buttonContainer.style.position = 'fixed';
        buttonContainer.style.left = `${e.clientX}px`;
        buttonContainer.style.top = `${e.clientY}px`;
        const buttonRect = buttonContainer.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        
        if (e.clientX + buttonRect.width > viewportWidth) {
          buttonContainer.style.left = `${viewportWidth - buttonRect.width - 10}px`;
        }
        
        if (e.clientY + buttonRect.height > viewportHeight) {
          buttonContainer.style.top = `${viewportHeight - buttonRect.height - 10}px`;
        }

        const hideButtons = () => {
          buttonContainer.style.display = 'none';
          document.removeEventListener('click', hideButtons);
        };

        setTimeout(() => {
          document.addEventListener('click', hideButtons);
        }, 100);
      });
      

      item.addEventListener('click', (e) => {
        if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
          e.preventDefault();
          document.querySelectorAll('.message-buttons').forEach(btn => {
            btn.style.display = 'none';
          });

          document.body.appendChild(buttonContainer);
          buttonContainer.style.display = 'flex';
          buttonContainer.style.zIndex = '9999';
          buttonContainer.style.position = 'fixed';
          buttonContainer.style.left = `${e.clientX - 40}px`;
          buttonContainer.style.top = `${e.clientY - 20}px`;
          const buttonRect = buttonContainer.getBoundingClientRect();
          const viewportWidth = window.innerWidth;
          const viewportHeight = window.innerHeight;
          
          if (e.clientX + buttonRect.width > viewportWidth) {
            buttonContainer.style.left = `${viewportWidth - buttonRect.width - 10}px`;
          }
          
          if (e.clientY + buttonRect.height > viewportHeight) {
            buttonContainer.style.top = `${viewportHeight - buttonRect.height - 10}px`;
          }

          const hideButtons = () => {
            buttonContainer.style.display = 'none';
            document.removeEventListener('click', hideButtons);
          };

          setTimeout(() => {
            document.addEventListener('click', hideButtons);
          }, 100);
        }
      });
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

socket.on('message edited', (updatedMsg) => {
  const item = [...messages.children].find(li => li.dataset.id === updatedMsg._id);
  if (item) {
    const messageContent = item.querySelector('.message-content');
    if (messageContent) {
      messageContent.textContent = updatedMsg.message;
    }
  }
});

socket.on('message deleted', (id) => {
  const item = [...messages.children].find(li => li.dataset.id === id);
  if (item) item.remove();
});

async function editMessage(id, itemElement) {
  const messageContent = itemElement.querySelector('.message-content');
  const currentText = messageContent.textContent;
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
      messageContent.textContent = updatedMsg.message;
    } else {
      alert('Failed to edit message');
    }
  } catch (err) {
    console.error(err);
  }
}

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