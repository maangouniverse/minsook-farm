// API Key (User provided)
const API_KEY = 'AQ.Ab8RN6Khy9T657rH3DowzCYfJtp78EdxtFyDwZTqYyzQFu0Ksg';
const MODEL_NAME = 'gemini-2.5-flash';

// System Instruction for Gemini
const SYSTEM_INSTRUCTION = `
당신은 전라남도 고흥에서 친환경 백다다기 오이를 재배하여 직거래 판매하는 민숙농장의 대표 '민숙 씨'의 역할을 수행하는 AI 상담원입니다.
방문객에게 신선한 오이를 자랑하고 친절하며 정중하게 설명해주세요.

[말투 및 톤앤매너]
- 언제나 고객에게 친절하고 정중한 존댓말(하십시오체, 해요체)을 사용합니다.
- 밝고 신뢰감 있는 목소리로 상냥하게 답변하며, 오이에 대한 강한 자부심을 드러냅니다.
- 오이가 시원하고 아삭하다는 점을 강조하며 이모티콘(🥒, ☀️, 📦, 🧑‍🌾 등)을 문맥에 맞게 섞어 씁니다.

[농장 정보 및 데이터]
- 오이 종류 및 주문 방식 :
  * 특품 오이: 무게 단위(1kg당 7,900원, 1kg 단위 주문) 또는 개수 단위(10개당 7,500원, 10개 단위 주문) 중 선택 가능.
  * 상품 오이: 무게 단위(1kg당 5,900원, 1kg 단위 주문) 또는 개수 단위(10개당 5,500원, 10개 단위 주문) 중 선택 가능.
  * 공품 오이 (못난이): 무게 단위 주문만 가능. (1kg당 3,900원, 1kg 단위 주문)
  * 한입 오이 (시그니처): 무게 단위 주문만 가능. (1kg당 5,800원 / 500g 팩당 2,900원. 0.5kg 단위 주문 가능)
- 무게 및 수량 제한 조건:
  * 개수 단위 주문 시 개당 무게는 **180g (0.18kg)**으로 환산하여 제한 조건에 적용합니다.
  * **한입 오이만 주문 시**: 최대 **6kg**까지 가능합니다.
  * **다른 오이만 주문 시**: 최대 **12kg**까지 가능합니다.
  * **한입 오이(A)와 다른 오이(B) 함께 주문 시**:
    - 한입 5kg + 다른오이 최대 4kg
    - 한입 4kg + 다른오이 최대 5kg
    - 한입 3kg + 다른오이 최대 6kg
    - 한입 2kg + 다른오이 최대 7kg
    - 한입 1kg + 다른오이 최대 8kg
    - 한입 0.5kg (500g) + 다른오이 최대 9kg
    (한입 오이가 5kg을 초과하는 경우 다른 오이는 동시 주문 불가)
- 배송 정보: 기본 배송비 4,000원. 매일 아침 수확하여 오후에 택배 발송 (당일수확 당일발송 원칙).
- A/S 및 보장: 배송 중 파손되거나 상한 오이가 있으면 100% 책임 보상(재발송 또는 부분 환불). 대표 번호(010-8990-4046)로 사진과 함께 연락 달라고 안내.
- 입금 계좌: 농협 312-0219-8388-41 (예금주: 최정민(민숙농장)).
- 포장: 100% 친환경 포장 (황토 종이박스, 종이 완충재, 종이 테이프 사용. 단 수분 유지용 내포장 비닐 제외).

[스마트 액션 및 주문 안내]
- 사용자가 가격 계산을 요청하거나 직접 주문하고 싶어하면 "아래의 [주문 계산기 바로가기] 버튼을 누르시거나 화면 중앙의 실시간 계산기를 이용해 보세요." 라고 안내하며 스마트 버튼 링크를 제공할 것.
- 답변 안에 반드시 다음 형식의 퀵 링크/스마트 액션 텍스트를 포함해야 합니다:
  * [주문 계산기 바로가기](action:scroll-to-calculator) : 계산기 영역으로 이동이 필요한 경우
  * [간편 주문서 작성하기](action:scroll-to-form) : 직접 주문 양식 작성이 필요한 경우
  * [스마트스토어로 가기](https://smartstore.naver.com/minsook_farm) : 스마트스토어 구매를 원하는 경우
- 해당 마크다운 스타일 액션 외에는 일반 텍스트로 자연스럽게 대화하세요.
`;

let chatHistory = [];

// DOM Elements
let chatbotBubble;
let chatbotWindow;
let btnChatbotClose;
let btnChatbotReset;
let chatbotMessages;
let chatbotInput;
let btnChatbotSend;
let quickQuestions;
let chatbotBadge;

document.addEventListener('DOMContentLoaded', () => {
  // Initialize Elements
  chatbotBubble = document.getElementById('chatbotBubble');
  chatbotWindow = document.getElementById('chatbotWindow');
  btnChatbotClose = document.getElementById('btnChatbotClose');
  btnChatbotReset = document.getElementById('btnChatbotReset');
  chatbotMessages = document.getElementById('chatbotMessages');
  chatbotInput = document.getElementById('chatbotInput');
  btnChatbotSend = document.getElementById('btnChatbotSend');
  quickQuestions = document.getElementById('quickQuestions');
  chatbotBadge = document.querySelector('.chatbot-badge');

  // Event Listeners
  if (chatbotBubble) {
    chatbotBubble.addEventListener('click', toggleChatbot);
  }
  if (btnChatbotClose) {
    btnChatbotClose.addEventListener('click', closeChatbot);
  }
  if (btnChatbotReset) {
    btnChatbotReset.addEventListener('click', resetChat);
  }
  if (btnChatbotSend) {
    btnChatbotSend.addEventListener('click', handleSend);
  }
  if (chatbotInput) {
    chatbotInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        handleSend();
      }
    });
  }
  if (quickQuestions) {
    quickQuestions.addEventListener('click', handleQuickQuestion);
  }

  // Load Chat History from Local Storage
  loadSessionHistory();
});

// Toggle Chat window
function toggleChatbot() {
  if (chatbotWindow) {
    const isHidden = chatbotWindow.classList.contains('hidden');
    if (isHidden) {
      chatbotWindow.classList.remove('hidden');
      if (chatbotBadge) {
        chatbotBadge.classList.add('hidden'); // hide badge once opened
      }
      if (chatbotInput) {
        chatbotInput.focus();
      }
      scrollToBottom();
    } else {
      chatbotWindow.classList.add('hidden');
    }
  }
}

// Close Chat window
function closeChatbot() {
  if (chatbotWindow) {
    chatbotWindow.classList.add('hidden');
  }
}

// Handle sending message
async function handleSend() {
  if (!chatbotInput) return;
  const text = chatbotInput.value.trim();
  if (!text) return;

  // Clear Input
  chatbotInput.value = '';

  // Append user message to UI and save to history
  appendMessage(text, 'user', true);

  // Send message to Gemini API
  await getGeminiResponse();
}

// Quick Question Click
async function handleQuickQuestion(e) {
  const chip = e.target.closest('.qq-chip');
  if (!chip) return;

  const question = chip.getAttribute('data-question');
  
  // Hide quick questions container after first interaction to keep chat clean
  if (quickQuestions) {
    quickQuestions.style.display = 'none';
  }

  appendMessage(question, 'user', true);
  await getGeminiResponse();
}

// Format message text and handle action links
function formatMessageText(text) {
  // Escape HTML first to prevent XSS
  let formattedHtml = escapeHtml(text).replace(/\n/g, '<br>');

  // Regex to match [Button Name](action:...) or [Link Name](url)
  const actionRegex = /\[([^\]]+)\]\((action:[^\)]+)\)/g;
  const urlRegex = /\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g;

  // Create custom buttons for actions
  formattedHtml = formattedHtml.replace(actionRegex, (match, label, action) => {
    return `<button class="msg-action-btn" data-action="${action}">${label}</button>`;
  });

  // Create anchors for urls
  formattedHtml = formattedHtml.replace(urlRegex, (match, label, url) => {
    return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="msg-action-btn">${label}</a>`;
  });

  return formattedHtml;
}

// Simple HTML escaping helper to prevent XSS
function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, function(m) { return map[m]; });
}

// Append Message to UI
function appendMessage(text, role, saveToHistory = true) {
  if (!chatbotMessages) return;

  const msgDiv = document.createElement('div');
  msgDiv.className = `chat-message ${role}`;

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';
  
  if (role === 'bot') {
    bubble.innerHTML = formatMessageText(text);
    // Bind click events to any actions inside this bubble
    bubble.querySelectorAll('button[data-action]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const action = e.target.getAttribute('data-action');
        triggerAction(action);
      });
    });
  } else {
    bubble.textContent = text;
  }

  const timeDiv = document.createElement('div');
  timeDiv.className = 'msg-time';
  
  const now = new Date();
  let hours = now.getHours();
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? '오후' : '오전';
  hours = hours % 12;
  hours = hours ? hours : 12; // 0 should be 12
  timeDiv.textContent = `${ampm} ${hours}:${minutes}`;

  msgDiv.appendChild(bubble);
  msgDiv.appendChild(timeDiv);
  chatbotMessages.appendChild(msgDiv);

  // Auto scroll
  scrollToBottom();

  // Save to history
  if (saveToHistory) {
    chatHistory.push({ role: role === 'user' ? 'user' : 'model', parts: [{ text }] });
    saveSessionHistory();
  }
}

// Trigger smart actions based on button click
function triggerAction(action) {
  if (action === 'action:scroll-to-calculator') {
    const calc = document.getElementById('order');
    if (calc) {
      calc.scrollIntoView({ behavior: 'smooth' });
      // highlight calc container
      calc.classList.remove('bounce-active');
      void calc.offsetWidth;
      calc.classList.add('bounce-active');
    }
  } else if (action === 'action:scroll-to-form') {
    const form = document.getElementById('orderForm');
    if (form) {
      form.scrollIntoView({ behavior: 'smooth' });
      form.classList.remove('bounce-active');
      void form.offsetWidth;
      form.classList.add('bounce-active');
      
      // Focus on first input
      const nameInput = document.getElementById('orderName');
      if (nameInput) {
        setTimeout(() => nameInput.focus(), 800);
      }
    }
  }
}

// Show/Hide typing indicator
let typingIndicator = null;
function showTypingIndicator() {
  if (!chatbotMessages) return;

  if (typingIndicator) return; // already showing

  typingIndicator = document.createElement('div');
  typingIndicator.className = 'typing-indicator';
  typingIndicator.innerHTML = `
    <div class="typing-dot"></div>
    <div class="typing-dot"></div>
    <div class="typing-dot"></div>
  `;
  chatbotMessages.appendChild(typingIndicator);
  scrollToBottom();
}

function hideTypingIndicator() {
  if (typingIndicator && chatbotMessages) {
    chatbotMessages.removeChild(typingIndicator);
    typingIndicator = null;
  }
}

// API Call to Gemini via Direct REST API Fetch
async function getGeminiResponse() {
  showTypingIndicator();

  // Use the standard Google Generative Language beta API URL
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${API_KEY}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: chatHistory,
        systemInstruction: {
          parts: [{ text: SYSTEM_INSTRUCTION }]
        },
        generationConfig: {
          temperature: 0.7,
        }
      })
    });

    if (!response.ok) {
      const errData = await response.json();
      throw new Error(errData.error?.message || `HTTP ${response.status}`);
    }

    const data = await response.json();
    hideTypingIndicator();
    
    const botText = data.candidates?.[0]?.content?.parts?.[0]?.text || "죄송합니다, 잠시 오류가 발생했습니다. 다시 한번 말씀해 주세요.";
    appendMessage(botText, 'bot', true);

  } catch (error) {
    console.error('Gemini API Error:', error);
    hideTypingIndicator();
    appendMessage("현재 인터넷 연결이 불안정하거나 API 설정에 문제가 있는 것 같습니다. 잠시 후 다시 시도해 주시거나 대표 연락처(010-8990-4046)로 직접 문자 주문을 남겨주세요. 🥒", 'bot', true);
  }
}

// Scroll to bottom helper
function scrollToBottom() {
  if (chatbotWindow) {
    const body = chatbotWindow.querySelector('.chatbot-body');
    if (body) {
      body.scrollTop = body.scrollHeight;
    }
  }
}

// Local Storage Session Management
function saveSessionHistory() {
  // 새로고침 시 채팅이 초기화되도록 브라우저 저장소에 저장하지 않습니다.
}

function loadSessionHistory() {
  // 새로고침 시 채팅이 초기화되도록 이전 내역을 불러오지 않습니다.
}

// Reset Chat Function
function resetChat() {
  if (!confirm('대화 내용을 모두 초기화하시겠습니까?')) return;
  
  chatHistory = [];

  // Clear UI messages except the first bot welcome message
  if (chatbotMessages) {
    chatbotMessages.innerHTML = `
      <!-- Initial welcome message from bot -->
      <div class="chat-message bot">
        <div class="msg-bubble">
          안녕하세요! 민숙농장에 방문해 주셔서 진심으로 감사드립니다. 🥒 고흥에서 매일 아침 당일 수확해서 보내드리는 아삭한 백다다기 오이 직거래 전문 농장입니다. 궁금하신 점이 있으시면 언제든지 편하게 문의해 주세요.
        </div>
      </div>
    `;

    // Restore Quick Questions
    if (quickQuestions) {
      quickQuestions.style.display = 'flex';
      chatbotMessages.appendChild(quickQuestions);
    }
  }

  scrollToBottom();
}
