const socket = io();

const form = document.getElementById('form');
const input = document.getElementById('input');
const messages = document.getElementById('messages');
const uploadButton = document.querySelector('.upload-button');
const imageUploadModal = document.getElementById('imageUploadModal');
const imageUploadForm = document.getElementById('imageUploadForm');
const imageFileInput = document.getElementById('imageFile');
const closeModal = document.querySelector('.close-modal');
const onlineUsersList = document.getElementById('online-users-list');
const channelSelect = document.getElementById('channel-select');
const zoomModal = document.getElementById('zoomModal');
const zoomedImage = document.getElementById('zoomedImage');
const closeZoom = document.querySelector('.close-zoom');
const zoomSlider = document.getElementById('zoomSlider');
const tenorModal = document.getElementById('tenorModal');
const tenorButton = document.getElementById('tenor-button');
const closeTenorModal = document.querySelector('.close-tenor-modal');
const tenorSearch = document.getElementById('tenor-search');
const tenorResults = document.getElementById('tenor-results');
const moreActions = document.querySelector('.more-actions');
const plusButton = document.querySelector('.plus-btn');

const replyPreview = document.getElementById('reply-preview');
const replyTextEl = document.getElementById('reply-text');
const cancelReplyBtn = document.getElementById('cancel-reply-btn');

let username = localStorage.getItem('username');
let imageBase64 = null;
let replyTo = null;
let currentChannel = 'general';

const MAX_IMAGE_SIZE_MB = 32;
const MAX_IMAGE_SIZE_BYTES = MAX_IMAGE_SIZE_MB * 1024 * 1024;

if (!username) {
  alert('You must be logged in.');
  window.location.href = '/login';
}

channelSelect.addEventListener('change', () => {
  const newChannel = channelSelect.value;
  if (newChannel !== currentChannel) {
    socket.emit('join channel', newChannel);
    currentChannel = newChannel;
    loadedMessagesCount = 0;
  }
});

uploadButton.addEventListener('click', () => {
  imageUploadModal.style.display = 'block';
});

closeModal.addEventListener('click', () => {
  imageUploadModal.style.display = 'none';
});

imageFileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) {
    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      alert(`Image size exceeds the limit of ${MAX_IMAGE_SIZE_MB}MB.`);
      imageFileInput.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      imageBase64 = e.target.result;
      imageUploadForm.dispatchEvent(new Event('submit'));
    };
    reader.readAsDataURL(file);
  }
});

imageUploadForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  if (imageBase64) {
    try {
      const response = await fetch('/api/upload-image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ image: imageBase64 }),
      });

      const data = await response.json();

      if (data.success) {
        socket.emit('chat message', { imageUrl: data.url, type: 'image' });
        imageBase64 = null;
        imageFileInput.value = '';
        imageUploadModal.style.display = 'none';
      } else {
        alert('Image upload failed. Please try again.');
      }
    } catch (error) {
      console.error('Error uploading image:', error);
      alert('Image upload failed. Please try again.');
    }
  }
});

input.addEventListener('paste', (e) => {
  const pastedText = (e.clipboardData || window.clipboardData).getData('text');
  if (pastedText.match(/\.(jpeg|jpg|gif|png)$/) != null) {
    socket.emit('chat message', { imageUrl: pastedText, type: 'image' });
    e.preventDefault();
  }
});

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

function setupMessageButtons(item, data) {
  const buttonContainer = document.createElement('div');
  buttonContainer.className = 'message-buttons';
  buttonContainer.style.display = 'none';

  const replyBtn = document.createElement('button');
  replyBtn.textContent = 'Reply';
  replyBtn.onclick = (e) => {
    e.stopPropagation();
    replyToMessage(data._id, item);
    buttonContainer.style.display = 'none';
  };
  buttonContainer.appendChild(replyBtn);
  
  if (data.username === username) {
    if (!data.imageUrl) {
      const editBtn = document.createElement('button');
      editBtn.textContent = 'Edit';
      editBtn.onclick = (e) => {
        e.stopPropagation();
        editMessage(data._id, item);
        buttonContainer.style.display = 'none';
      };
      buttonContainer.appendChild(editBtn);
    }

    const delBtn = document.createElement('button');
    delBtn.textContent = 'Delete';
    delBtn.onclick = (e) => {
      e.stopPropagation();
      deleteMessage(data._id, item);
      buttonContainer.style.display = 'none';
    };

    buttonContainer.appendChild(delBtn);
  }
  
  item.appendChild(buttonContainer);

  const showButtons = (clientX, clientY) => {
    document.querySelectorAll('.message-buttons').forEach(btn => {
      btn.style.display = 'none';
    });

    document.body.appendChild(buttonContainer);
    buttonContainer.style.display = 'flex';
    buttonContainer.style.zIndex = '9999';
    buttonContainer.style.position = 'fixed';
    buttonContainer.style.left = `${clientX}px`;
    buttonContainer.style.top = `${clientY}px`;
    const buttonRect = buttonContainer.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    if (clientX + buttonRect.width > viewportWidth) {
      buttonContainer.style.left = `${viewportWidth - buttonRect.width - 10}px`;
    }
    
    if (clientY + buttonRect.height > viewportHeight) {
      buttonContainer.style.top = `${viewportHeight - buttonRect.height - 10}px`;
    }

    const hideButtons = () => {
      buttonContainer.style.display = 'none';
      document.removeEventListener('click', hideButtons);
    };

    setTimeout(() => {
      document.addEventListener('click', hideButtons);
    }, 100);
  };

  item.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    showButtons(e.clientX, e.clientY);
  });
  
  item.addEventListener('click', (e) => {
    if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
      e.preventDefault();
      showButtons(e.clientX - 40, e.clientY - 20);
    }
  });
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

    if (data.replyTo) {
      const replyDiv = document.createElement('div');
      replyDiv.className = 'reply-info';
      replyDiv.textContent = `Replying to ${data.replyTo.username}: ${data.replyTo.text}`;

      messageContainer.appendChild(replyDiv);
    }
    
    const messageContent = document.createElement('div');
    messageContent.className = 'message-content';
    
    if (data.type === 'tenor') {
      const iframe = document.createElement('iframe');
      iframe.src = `https://tenor.com/embed/${data.postid}?autoplay=1&mute=1`;
      iframe.width = '300';
      iframe.height = '300';
      iframe.frameBorder = '0';
      iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
      iframe.style.border = 'none';
      messageContent.appendChild(iframe);
    } else if (data.imageUrl) {
      const image = document.createElement('img');
      image.src = data.imageUrl;
      image.style.maxWidth = '300px';
      image.style.maxHeight = '300px';
      image.addEventListener('click', () => {
        zoomedImage.src = image.src;
        zoomModal.style.display = 'flex';
        zoomSlider.value = 1;
        zoomedImage.style.transform = 'scale(1)';
      });
      messageContent.appendChild(image);
    } else {
      const messageText = data.message;
      const tenorMatch = messageText.match(/tenor\.com\/view\/.*-(\d+)/);
      if (tenorMatch) {
        const postid = tenorMatch[1];
        const iframe = document.createElement('iframe');
        iframe.src = `https://tenor.com/embed/${postid}?autoplay=1&mute=1`;
        iframe.width = '300';
        iframe.height = '300';
        iframe.frameBorder = '0';
        iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
        iframe.style.border = 'none';
        messageContent.appendChild(iframe);
      } else if (messageText.match(/^https?:\/\/.*\.gif$/i)) {
        const img = document.createElement('img');
        img.src = messageText;
        img.style.maxWidth = '300px';
        img.style.maxHeight = '300px';
        img.addEventListener('click', () => {
          zoomedImage.src = img.src;
          zoomModal.style.display = 'flex';
          zoomSlider.value = 1;
          zoomedImage.style.transform = 'scale(1)';
        });
        messageContent.appendChild(img);
      } else {
        messageContent.textContent = messageText;
      }
    }
    
    messageContainer.appendChild(messageHeader);
    messageContainer.appendChild(messageContent);
    
    item.appendChild(messageContainer);

    setupMessageButtons(item, data);
    
  }
  return item;
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  if (input.value) {
    socket.emit('chat message', { message: input.value, replyTo });
    input.value = '';
    input.placeholder = 'Type a message...';
    replyTo = null;
    // hide preview after sending
    if (replyPreview) replyPreview.style.display = 'none';
    input.focus();
  } else {
    alert('Please enter a message');
  }
});

socket.on('chat history', (msgs) => {
  messages.innerHTML = '';
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
      body: JSON.stringify({ newMessage }),
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

function replyToMessage(id, item) {
  const username = item.querySelector('.username').textContent;
  const messageText = item.querySelector('.message-content').textContent;
  replyTo = { id, text: messageText, username: username };
  // show inline preview (do not change input placeholder)
  if (replyPreview && replyTextEl) {
    replyTextEl.textContent = `Replying to ${username}: ${messageText}`;
    replyPreview.style.display = 'flex';
  }
  input.focus();
}

if (cancelReplyBtn) {
  cancelReplyBtn.addEventListener('click', (e) => {
    e.preventDefault();
    replyTo = null;
    if (replyPreview) replyPreview.style.display = 'none';
    input.focus();
  });
}

function scrollToBottom() {
  messages.scrollTop = messages.scrollHeight;
}

socket.on('online users', (users) => {
  onlineUsersList.innerHTML = '';
  users.forEach(user => {
    const li = document.createElement('li');
    li.textContent = user;
    onlineUsersList.appendChild(li);
  });
});

const toggleButton = document.getElementById('toggle-online-users');
toggleButton.addEventListener('click', () => {
  const onlineUsers = document.getElementById('online-users');
  if (onlineUsers.style.display === 'none' || onlineUsers.style.display === '') {
    onlineUsers.style.display = 'block';
  } else {
    onlineUsers.style.display = 'none';
  }
});

let isLoadingOlder = false;
messages.addEventListener('scroll', async () => {
  if (messages.scrollTop === 0 && !isLoadingOlder) {
    isLoadingOlder = true;
    try {
      const response = await fetch(`/messages?skip=${loadedMessagesCount}&channel=${currentChannel}`);
      const olderMsgs = await response.json();
      if (olderMsgs.length > 0) {
        const oldScrollHeight = messages.scrollHeight;
        olderMsgs.forEach(data => {
          const msgEl = createMessageElement(data);
          messages.insertBefore(msgEl, messages.firstChild);
        });
        loadedMessagesCount += olderMsgs.length;
        messages.scrollTop = messages.scrollHeight - oldScrollHeight;
      }
    } catch (error) {
      console.error('Error loading older messages:', error);
    } finally {
      isLoadingOlder = false;
    }
  }
});

closeZoom.addEventListener('click', () => {
  zoomModal.style.display = 'none';
});

zoomModal.addEventListener('click', (e) => {
  if (e.target === zoomModal) {
    zoomModal.style.display = 'none';
  }
});

zoomSlider.addEventListener('input', (e) => {
  zoomedImage.style.transform = `scale(${e.target.value})`;
});

tenorButton.addEventListener('click', () => {
  tenorModal.style.display = 'block';
});

closeTenorModal.addEventListener('click', () => {
  tenorModal.style.display = 'none';
});

tenorSearch.addEventListener('keyup', (e) => {
  if (e.key === 'Enter') {
    searchTenor(e.target.value);
  }
});

async function searchTenor(query) {
  tenorResults.innerHTML = 'Searching...';
  try {
    const response = await fetch(`/api/tenor-search?q=${encodeURIComponent(query)}`);
    if (!response.ok) {
      throw new Error('Failed to search Tenor GIFs');
    }
    const data = await response.json();
    tenorResults.innerHTML = '';
    data.results.forEach(gif => {
      const img = document.createElement('img');
      img.src = gif.media_formats.gif.url;
      img.addEventListener('click', () => {
        socket.emit('chat message', { postid: gif.id, type: 'tenor' });
        tenorModal.style.display = 'none';
      });
      tenorResults.appendChild(img);
    });
  } catch (error) {
    console.error('Error searching Tenor GIFs:', error);
    tenorResults.innerHTML = 'Failed to load GIFs.';
  }
}

plusButton.addEventListener('click', () => {
  moreActions.classList.toggle('active');
});