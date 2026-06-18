/* AIC main rebuild clean version
   Supabase 저장 연결 버전
   - 회의방: public.aic_rooms
   - 메시지: public.aic_messages
   - 참여자: public.aic_room_members
*/
(function () {
  'use strict';

  var els = {};
  var resizeTimer = null;

  var CONFIG = {
    defaultSettings: {
      defaultLang: 'ko',
      direction: 'auto',
      tone: 'business',
      display: 'both',
      autoTranslate: true
    },
    slotPolicy: {
      defaultVisibleSlots: 2,
      maxVisibleSlots: 3,
      notebookMaxSlots: 2,
      mobileMaxSlots: 1,
      notebookBreakpoint: 1280,
      mobileBreakpoint: 900
    }
  };

  if (window.AIC_CONFIG) {
    CONFIG.defaultSettings = Object.assign({}, CONFIG.defaultSettings, window.AIC_CONFIG.defaultSettings || {});
    CONFIG.slotPolicy = Object.assign({}, CONFIG.slotPolicy, window.AIC_CONFIG.slotPolicy || {});
  }

  var state = {
    activeSlotIndex: 0,
    activeParticipantsRoomId: '',
    visibleSlotCount: CONFIG.slotPolicy.defaultVisibleSlots,
    preferredSlotCount: CONFIG.slotPolicy.defaultVisibleSlots,
    openSlots: [],
    settings: loadSettings(),
    rooms: [],
    selectedRoomParticipants: [],
    selectedInviteParticipants: [],
    roomSearchResults: [],
    inviteSearchResults: [],
    orgMaps: {
      divisions: {},
      teams: {}
    },
    realtimeChannel: null,
    realtimeChannelName: '',
    realtimeChannelBaseName: '',
    realtimeSeq: 0,
    realtimeReady: false,
    realtimeSubscribing: false,
    realtimeResubscribeTimer: null,
    readRealtimeChannel: null,
    readRealtimeChannelName: '',
    readRealtimeChannelBaseName: '',
    readRealtimeSeq: 0,
    readRealtimeReady: false,
    readRealtimeSubscribing: false,
    readRealtimeResubscribeTimer: null,
    readMap: {},
    readSaveTimer: null,
    readSyncReady: false,
    readSavingRooms: {},
    dbReady: false,
    dbLoading: false
  };

  function $(id) {
    return document.getElementById(id);
  }

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function tr(key, fallback) {
    if (window.I18N && typeof window.I18N.t === 'function') {
      var value = window.I18N.t(key);
      return value && value !== key ? value : fallback;
    }
    return fallback;
  }

  function getCurrentLang() {
    return String(
      window.I18N?.currentLang ||
      localStorage.getItem('portal_lang') ||
      localStorage.getItem('i18n.lang') ||
      'ko'
    ).trim() || 'ko';
  }

  function trKey(key, fallback) {
    if (!key) return fallback || '';
    var value = tr(key, fallback || '');
    return value && value !== key ? value : (fallback || '');
  }

  function getAicTranslateEndpoint() {
    return String(window.AIC_API?.translateEndpoint || '/api/aic-translate').trim() || '/api/aic-translate';
  }

  function getAicClientId() {
    if (!window.__aicClientId) {
      window.__aicClientId = 'aic_' + Date.now() + '_' + Math.random().toString(16).slice(2);
    }
    return window.__aicClientId;
  }

  function hasMessage(room, message) {
    if (!room || !message) return false;
    var id = String(message.id || '').trim();
    var sender = String(message.sender || '').trim();
    var original = String(message.original || '').trim();

    return (room.messages || []).some(function (item) {
      if (id && String(item.id || '').trim() === id) return true;

      // 내가 보낸 임시 메시지가 DB 저장 후 Realtime으로 다시 들어오는 경우 중복 표시 방지
      var itemId = String(item.id || '').trim();
      if (itemId.indexOf('temp_') === 0) {
        var itemEmail = String(item.sender_email || '').trim().toLowerCase();
        var messageEmail = String(message.sender_email || '').trim().toLowerCase();

        if (itemEmail && messageEmail && itemEmail === messageEmail &&
          String(item.original || '').trim() === original) {
          return true;
        }

        return String(item.sender || '').trim() === sender &&
          String(item.original || '').trim() === original;
      }

      return false;
    });
  }

  function normalizeDbMessage(message) {
    var currentEmail = getCurrentUserEmail();
    var senderEmail = String(message.sender_email || '').trim();
    var original = message.original || '';
    return {
      id: message.id || '',
      type: senderEmail && currentEmail && senderEmail === currentEmail ? 'me' : 'other',
      sender: message.sender_name || senderEmail || '상대방',
      sender_email: senderEmail,
      original: original,
      translated: message.translated || '',
      source_lang: message.source_lang || detectTextLanguage(original),
      translations: normalizeTranslations(message.translations),
      attachment: getAttachmentFromMessage({ translations: message.translations }),
      created_at: message.created_at || ''
    };
  }

  function detectTextLanguage(text) {
    var value = String(text || '').trim();
    if (!value) return 'auto';

    var koreanCount = (value.match(/[가-힣]/g) || []).length;
    var latinCount = (value.match(/[A-Za-z]/g) || []).length;

    if (koreanCount > 0 && koreanCount >= latinCount * 0.25) return 'ko';
    if (latinCount > 0) return 'en';

    return state.settings.defaultLang || getCurrentLang() || 'ko';
  }

  function getViewerLanguage() {
    var lang = normalizeAicLang(
      state.settings.defaultLang ||
      getCurrentLang() ||
      'ko'
    );

    return lang || 'ko';
  }

  function normalizeAicLang(value) {
    var lang = String(value || '').trim().toLowerCase();
    if (!lang) return '';

    if (lang === 'kr' || lang === 'korean' || lang.indexOf('ko') === 0) return 'ko';
    if (lang === 'english' || lang.indexOf('en') === 0) return 'en';
    if (lang === 'japanese' || lang.indexOf('ja') === 0 || lang.indexOf('jp') === 0) return 'ja';
    if (lang === 'chinese' || lang.indexOf('zh') === 0 || lang.indexOf('cn') === 0) return 'zh';
    if (lang === 'vietnamese' || lang.indexOf('vi') === 0) return 'vi';
    if (lang === 'thai' || lang.indexOf('th') === 0) return 'th';
    if (lang === 'spanish' || lang.indexOf('es') === 0) return 'es';
    if (lang === 'french' || lang.indexOf('fr') === 0) return 'fr';
    if (lang === 'german' || lang.indexOf('de') === 0) return 'de';

    return lang.slice(0, 8);
  }

  function normalizeTranslations(value) {
    if (!value) return {};
    if (typeof value === 'object' && !Array.isArray(value)) return value;

    try {
      var parsed = JSON.parse(String(value));
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (_) {
      return {};
    }
  }

  function getTranslationForLang(msg, lang) {
    var targetLang = normalizeAicLang(lang || getViewerLanguage());
    var translations = normalizeTranslations(msg && msg.translations);

    if (targetLang && translations[targetLang]) {
      return String(translations[targetLang] || '');
    }

    return '';
  }

  function getPreferredMessageText(msg) {
    var original = String(msg?.original || '');
    var translated = String(msg?.translated || '');
    var sourceLang = normalizeAicLang(msg?.source_lang) || detectTextLanguage(original);
    var viewerLang = getViewerLanguage();
    var viewerTranslation = getTranslationForLang(msg, viewerLang);

    // 내가 보낸 메시지는 모든 표시 모드에서 원문을 우선 보여줍니다.
    if (msg && msg.type === 'me') return original || viewerTranslation || translated;

    // 상대방 메시지는 내 개인설정 언어 기준 번역문을 우선 보여줍니다.
    if (sourceLang === viewerLang) return original || viewerTranslation || translated;
    return viewerTranslation || translated || original;
  }

  function buildMessageFooter(msg) {
    var timeText = formatMessageTime(msg?.created_at);
    if (!timeText) return '';
    return '<div class="aic-message-time">' + esc(timeText) + '</div>';
  }

  function getAicStorageBucket() {
    return String(window.AIC_API?.storageBucket || 'aic-files').trim() || 'aic-files';
  }

  function getAttachmentFromMessage(msg) {
    if (!msg) return null;
    if (msg.attachment && typeof msg.attachment === 'object') return msg.attachment;

    var translations = normalizeTranslations(msg.translations);
    if (translations.__attachment && typeof translations.__attachment === 'object') {
      return translations.__attachment;
    }

    return null;
  }

  function formatFileSize(size) {
    var bytes = Number(size) || 0;
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0) + ' MB';
    return (bytes / 1024 / 1024 / 1024).toFixed(1) + ' GB';
  }

  function getSafeFileExtension(name, mimeType) {
    var rawName = String(name || '').trim();
    var match = rawName.match(/\.([A-Za-z0-9]{1,12})$/);
    var ext = match ? String(match[1] || '').toLowerCase() : '';

    if (!ext) {
      var mime = String(mimeType || '').toLowerCase();
      var mimeMap = {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/gif': 'gif',
        'image/webp': 'webp',
        'application/pdf': 'pdf',
        'text/plain': 'txt',
        'text/csv': 'csv',
        'application/zip': 'zip',
        'application/vnd.ms-excel': 'xls',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
        'application/msword': 'doc',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
        'application/vnd.ms-powerpoint': 'ppt',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx'
      };
      ext = mimeMap[mime] || '';
    }

    ext = ext.replace(/[^a-z0-9]/g, '').slice(0, 12);
    return ext;
  }

  function sanitizeStoragePathPart(value, fallback) {
    var safe = String(value || fallback || '').trim()
      .replace(/[^A-Za-z0-9_-]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '');

    return safe || String(fallback || 'item');
  }

  function sanitizeStorageFileName(name, mimeType) {
    // Storage key에는 한글/공백/특수문자를 넣지 않습니다.
    // 원본 파일명은 aic_attachments.file_name 및 메시지 attachment metadata에 따로 보관합니다.
    var ext = getSafeFileExtension(name, mimeType);
    var unique = Date.now() + '_' + Math.random().toString(36).slice(2, 10);
    return unique + (ext ? '.' + ext : '');
  }

  function buildAttachmentStoragePath(room, file) {
    var companyId = sanitizeStoragePathPart(getCompanyId(), 'company');
    var roomId = sanitizeStoragePathPart(room?.id, 'room');
    var date = new Date().toISOString().slice(0, 10);
    var safeFileName = sanitizeStorageFileName(file?.name, file?.type);

    return [companyId, roomId, date, safeFileName].join('/');
  }

  function getAttachmentFileExtension(fileName) {
    var name = String(fileName || '').trim().toLowerCase();
    var match = name.match(/\.([a-z0-9]{1,12})(?:$|[?#])/i);
    return match ? match[1] : '';
  }

  function getAttachmentKind(attachment, fileName) {
    var mime = String(attachment?.mime_type || attachment?.type || '').toLowerCase();
    var ext = getAttachmentFileExtension(fileName || attachment?.file_name || attachment?.name);

    if (mime.indexOf('image/') === 0 || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].indexOf(ext) >= 0) return 'image';
    if (mime === 'application/pdf' || ext === 'pdf') return 'pdf';
    if (['xls', 'xlsx', 'csv', 'doc', 'docx', 'ppt', 'pptx'].indexOf(ext) >= 0) return 'office';
    return 'file';
  }

  function getAttachmentPrimaryActionLabel(kind) {
    return '열기';
  }

  function buildAttachmentMessage(room, msg) {
    var attachment = getAttachmentFromMessage(msg) || {};
    var sender = getMessageSenderName(room, msg);
    var isMine = msg && msg.type === 'me';
    var fileName = attachment.file_name || attachment.name || msg.original || '첨부파일';
    var fileSize = formatFileSize(attachment.file_size || attachment.size);
    var filePath = attachment.file_path || attachment.path || '';
    var kind = getAttachmentKind(attachment, fileName);
    var primaryLabel = getAttachmentPrimaryActionLabel(kind);
    var disabledAttr = filePath ? '' : ' disabled';

    return [
      '<div class="aic-message ', isMine ? 'me' : 'other', '">',
      '  <div class="aic-message-name">', esc(sender), '</div>',
      '  <div class="aic-attachment-card" style="display:flex;flex-direction:column;gap:8px;width:100%;max-width:300px;padding:10px 12px;border:1px solid rgba(148,163,184,.45);border-radius:14px;background:rgba(255,255,255,.94);color:#0f172a;text-align:left;">',
      '    <div style="display:flex;align-items:center;gap:10px;min-width:0;">',
      '      <span style="font-size:20px;line-height:1;flex:0 0 auto;">📎</span>',
      '      <span style="min-width:0;display:flex;flex-direction:column;gap:2px;flex:1 1 auto;">',
      '        <span title="', esc(fileName), '" style="font-weight:800;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">', esc(fileName), '</span>',
      fileSize ? '        <span style="font-size:11px;color:#64748b;">' + esc(fileSize) + '</span>' : '',
      '      </span>',
      '    </div>',
      '    <div style="display:flex;gap:6px;justify-content:flex-end;">',
      '      <button type="button" class="module-btn tiny" data-attachment-action="preview" data-attachment-kind="', esc(kind), '" data-attachment-path="', esc(filePath), '" data-attachment-name="', esc(fileName), '"', disabledAttr, ' style="height:26px;padding:0 9px;border-radius:9px;font-size:11px;font-weight:800;">', esc(primaryLabel), '</button>',
      '      <button type="button" class="module-btn tiny" data-attachment-action="download" data-attachment-kind="', esc(kind), '" data-attachment-path="', esc(filePath), '" data-attachment-name="', esc(fileName), '"', disabledAttr, ' style="height:26px;padding:0 9px;border-radius:9px;font-size:11px;font-weight:800;">저장</button>',
      '    </div>',
      '  </div>',
      buildMessageFooter(msg),
      '</div>'
    ].join('');
  }

  function isMobileAttachmentView() {
    return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '') || window.innerWidth <= 760;
  }

  async function createAicAttachmentSignedUrl(filePath, options) {
    var sb = getSupabaseClient();
    if (!sb || !filePath) throw new Error('Supabase Storage 연결을 확인해 주세요.');

    var result = await sb.storage
      .from(getAicStorageBucket())
      .createSignedUrl(filePath, 60 * 10, options || {});

    if (result.error) throw result.error;
    var url = result.data?.signedUrl;
    if (!url) throw new Error('서명 URL 생성 실패');
    return url;
  }

  function closeAicAttachmentPreview() {
    var existing = document.querySelector('[data-aic-attachment-preview-modal="1"]');
    if (existing) existing.remove();
  }

  function showAicAttachmentPreviewModal(url, fileName, kind) {
    closeAicAttachmentPreview();

    var modal = document.createElement('div');
    modal.setAttribute('data-aic-attachment-preview-modal', '1');
    modal.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(15,23,42,.58);display:flex;align-items:center;justify-content:center;padding:18px;';

    var bodyHtml = '';
    if (kind === 'image') {
      bodyHtml = '<img src="' + esc(url) + '" alt="' + esc(fileName) + '" style="max-width:100%;max-height:calc(100vh - 150px);object-fit:contain;border-radius:12px;background:#fff;" />';
    } else if (kind === 'pdf') {
      bodyHtml = '<iframe src="' + esc(url) + '" title="' + esc(fileName) + '" style="width:100%;height:calc(100vh - 145px);border:0;border-radius:12px;background:#fff;"></iframe>';
    } else {
      bodyHtml = '<div style="padding:32px;text-align:center;color:#475569;font-weight:800;">이 파일은 인앱 미리보기를 지원하지 않습니다.<br>열기 또는 다운로드를 이용해 주세요.</div>';
    }

    modal.innerHTML = [
      '<div style="width:min(980px,96vw);max-height:96vh;background:#fff;border-radius:18px;box-shadow:0 24px 80px rgba(15,23,42,.35);overflow:hidden;display:flex;flex-direction:column;">',
      '  <div style="display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid #e2e8f0;">',
      '    <div title="', esc(fileName), '" style="font-weight:900;color:#0f172a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1 1 auto;">', esc(fileName), '</div>',
      '    <button type="button" data-aic-preview-download="1" style="height:32px;padding:0 12px;border-radius:10px;border:1px solid #cbd5e1;background:#fff;font-weight:800;cursor:pointer;">저장</button>',
      '    <button type="button" data-aic-preview-close="1" style="height:32px;width:32px;border-radius:10px;border:1px solid #cbd5e1;background:#fff;font-size:18px;font-weight:900;cursor:pointer;">×</button>',
      '  </div>',
      '  <div style="padding:12px;background:#f8fafc;display:flex;align-items:center;justify-content:center;min-height:220px;">', bodyHtml, '</div>',
      '</div>'
    ].join('');

    modal.addEventListener('click', function (event) {
      if (event.target === modal || event.target.closest('[data-aic-preview-close]')) {
        closeAicAttachmentPreview();
      }
      if (event.target.closest('[data-aic-preview-download]')) {
        downloadAicAttachment(url, fileName);
      }
    });

    document.body.appendChild(modal);
  }

  function buildOfficeViewerUrl(url) {
    return 'https://view.officeapps.live.com/op/view.aspx?src=' + encodeURIComponent(url);
  }

  function getAicFileViewerPath() {
    // 실제 배포 위치:
    // attendance-portal/aic/file-viewer.html
    // 따라서 루트 기준 절대경로로 열어 Vercel 404를 방지합니다.
    if (window.AIC_API && window.AIC_API.fileViewerPath) {
      return String(window.AIC_API.fileViewerPath || '/aic/file-viewer.html').trim() || '/aic/file-viewer.html';
    }

    return '/aic/file-viewer.html';
  }

  function buildAicFileViewerUrl(fileUrl, fileName, kind) {
    var payload = {
      url: fileUrl || '',
      name: fileName || '첨부파일',
      kind: kind || 'file'
    };

    var viewerPath = getAicFileViewerPath();

    // 새 창/새 탭에서는 sessionStorage/localStorage key 전달이 환경에 따라 실패할 수 있습니다.
    // 따라서 파일 미리보기용 signed URL을 viewer.html의 URL 파라미터로 직접 전달합니다.
    return viewerPath +
      '?url=' + encodeURIComponent(payload.url) +
      '&name=' + encodeURIComponent(payload.name) +
      '&kind=' + encodeURIComponent(payload.kind);
  }

  function openAttachmentViewerUrl(url) {
    // 첨부파일 미리보기는 항상 별도 창/탭에서만 엽니다.
    // 현재 AIC 채팅 화면이 file-viewer.html로 이동하지 않도록 window.location fallback은 사용하지 않습니다.
    try {
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (_) {
      try {
        window.open(url, '_blank');
      } catch (error) {
        alert('첨부파일 미리보기 창을 열 수 없습니다. 팝업 차단 설정을 확인해 주세요.');
      }
    }
  }

  async function downloadAicAttachment(url, fileName) {
    var name = fileName || '첨부파일';

    try {
      var response = await fetch(url);
      if (!response.ok) throw new Error('다운로드 요청 실패');
      var blob = await response.blob();
      var objectUrl = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = objectUrl;
      a.download = name;
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(objectUrl); }, 2000);
    } catch (_) {
      var fallback = document.createElement('a');
      fallback.href = url;
      fallback.download = name;
      fallback.target = '_blank';
      fallback.rel = 'noopener noreferrer';
      document.body.appendChild(fallback);
      fallback.click();
      fallback.remove();
    }
  }

  async function openAicAttachment(filePath, fileName, action, kind) {
    if (!filePath) {
      alert('첨부파일 경로가 없습니다.');
      return;
    }

    action = action || 'preview';
    kind = kind || getAttachmentKind({}, fileName);
    fileName = fileName || '첨부파일';

    try {
      if (action === 'download') {
        var downloadUrl = await createAicAttachmentSignedUrl(filePath, {
          download: fileName
        });
        await downloadAicAttachment(downloadUrl, fileName);
        return;
      }

      var previewUrl = await createAicAttachmentSignedUrl(filePath);
      var viewerUrl = buildAicFileViewerUrl(previewUrl, fileName, kind);
      openAttachmentViewerUrl(viewerUrl);
    } catch (error) {
      alert('첨부파일 열기 실패: ' + (error?.message || 'Storage 정책/권한을 확인해 주세요.'));
    }
  }

  async function insertAttachmentToServer(room, message, attachment) {
    var sb = getSupabaseClient();
    var companyId = getCompanyId();
    if (!sb || !companyId || !room || !message || !attachment) return;

    var payload = {
      company_id: companyId,
      room_id: room.id,
      message_id: String(message.id || '').indexOf('temp_') === 0 ? null : message.id,
      sender_name: message.sender || getCurrentUserName(),
      sender_email: getCurrentUserEmail(),
      file_name: attachment.file_name || attachment.name || '첨부파일',
      file_path: attachment.file_path || attachment.path || '',
      file_url: attachment.file_url || '',
      file_size: attachment.file_size || attachment.size || 0,
      mime_type: attachment.mime_type || attachment.type || ''
    };

    var result = await sb.from('aic_attachments').insert(payload);
    if (result.error) throw result.error;
  }

  async function uploadAicAttachmentFile(room, file) {
    var sb = getSupabaseClient();
    if (!sb) throw new Error('Supabase 클라이언트를 찾을 수 없습니다.');
    if (!room || !file) throw new Error('업로드할 파일 정보가 없습니다.');

    var filePath = buildAttachmentStoragePath(room, file);
    var uploadResult = await sb.storage
      .from(getAicStorageBucket())
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type || 'application/octet-stream'
      });

    if (uploadResult.error) throw uploadResult.error;

    return {
      file_name: file.name || '첨부파일',
      file_path: filePath,
      file_size: file.size || 0,
      mime_type: file.type || 'application/octet-stream'
    };
  }

  async function translateWithAi(text, sourceLang, room) {
    if (!String(text || '').trim()) return '';
    if (!state.settings.autoTranslate) return tr('aic.autoTranslateOff', '자동번역 OFF 상태입니다.');

    var detectedSourceLang = detectTextLanguage(text);
    var requestedSourceLang = sourceLang || state.settings.defaultLang || detectedSourceLang || 'auto';

    try {
      var response = await fetch(getAicTranslateEndpoint(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: text,
          sourceLang: requestedSourceLang,
          detectedSourceLang: detectedSourceLang,
          viewerLang: getViewerLanguage(),
          targetLang: detectedSourceLang === 'ko' ? 'en' : 'ko',
          direction: state.settings.direction || 'auto',
          tone: state.settings.tone || 'business',
          display: state.settings.display || 'both',
          roomId: room?.id || '',
          roomName: room?.name || '',
          senderName: getCurrentUserName(),
          senderEmail: getCurrentUserEmail()
        })
      });

      var data = await response.json().catch(function () { return {}; });

      if (!response.ok || data.ok === false) {
        throw new Error(data.error || ('AI 번역 실패: HTTP ' + response.status));
      }

      var targetLang = normalizeAicLang(data.targetLang || data.target_lang || '');
      var source = normalizeAicLang(data.sourceLang || data.source_lang || detectedSourceLang);
      var translated = data.translated || data.translation || '';
      var translations = normalizeTranslations(data.translations);

      if (targetLang && translated && !translations[targetLang]) {
        translations[targetLang] = translated;
      }

      return {
        translated: translated,
        source_lang: source || detectedSourceLang,
        target_lang: targetLang,
        translations: translations
      };
    } catch (error) {
      console.warn('[AIC AI]', error);
      var fallback = fakeTranslate(text, sourceLang || state.settings.defaultLang);
      var fallbackTargetLang = detectedSourceLang === 'ko' ? 'en' : 'ko';
      var fallbackTranslations = {};
      fallbackTranslations[fallbackTargetLang] = fallback;
      return {
        translated: fallback,
        source_lang: detectedSourceLang,
        target_lang: fallbackTargetLang,
        translations: fallbackTranslations
      };
    }
  }

  function normalizeSettings(settings) {
    var next = Object.assign({}, CONFIG.defaultSettings, settings || {});

    // 개인 설정 화면에서는 내 언어와 표시 방식만 관리합니다.
    // 번역 방향/톤/자동번역 여부는 내부 기본값으로 고정합니다.
    next.direction = 'auto';
    next.tone = 'business';
    next.autoTranslate = true;

    next.defaultLang = normalizeAicLang(next.defaultLang) || 'ko';
    if (['original', 'translated', 'both'].indexOf(next.display) < 0) next.display = 'both';

    return next;
  }

  function loadSettings() {
    try {
      var raw = localStorage.getItem('aic_user_settings');
      if (raw) return normalizeSettings(JSON.parse(raw));
    } catch (_) {}
    return normalizeSettings(CONFIG.defaultSettings);
  }

  function saveSettingsToLocal() {
    try {
      localStorage.setItem('aic_user_settings', JSON.stringify(state.settings));
    } catch (_) {}
  }

  async function loadReadMapFromServer(roomIds) {
    var sb = getSupabaseClient();
    var companyId = getCompanyId();
    var email = getCurrentUserEmail();

    state.readMap = {};
    state.readSyncReady = false;

    if (!sb || !companyId || !email || !Array.isArray(roomIds) || !roomIds.length) {
      state.readSyncReady = true;
      return;
    }

    try {
      var result = await sb
        .from('aic_message_reads')
        .select('room_id, last_read_at')
        .eq('company_id', companyId)
        .eq('user_email', email)
        .in('room_id', roomIds);

      if (result.error) throw result.error;

      (result.data || []).forEach(function (row) {
        var roomId = String(row.room_id || '').trim();
        if (roomId) state.readMap[roomId] = row.last_read_at || '';
      });

      state.readSyncReady = true;
    } catch (error) {
      state.readSyncReady = true;
      console.warn('[AIC READ] server load skipped:', error);
    }
  }

  async function saveRoomReadToServer(roomId, lastReadAt) {
    var sb = getSupabaseClient();
    var companyId = getCompanyId();
    var email = getCurrentUserEmail();

    if (!sb || !companyId || !email || !roomId || !lastReadAt) return;
    if (state.readSavingRooms[roomId]) return;

    state.readSavingRooms[roomId] = true;

    try {
      var payload = {
        company_id: companyId,
        room_id: roomId,
        user_email: email,
        last_read_at: lastReadAt,
        updated_at: new Date().toISOString()
      };

      var result = await sb
        .from('aic_message_reads')
        .upsert(payload, { onConflict: 'company_id,room_id,user_email' });

      if (result.error) throw result.error;
    } catch (error) {
      console.warn('[AIC READ] server save skipped:', error);
    } finally {
      delete state.readSavingRooms[roomId];
    }
  }

  function saveReadMap() {
    // unread 상태는 aic_message_reads 서버 테이블에 저장합니다.
  }

  function getMessageTimeValue(message) {
    var value = message && message.created_at ? Date.parse(message.created_at) : 0;
    return Number.isFinite(value) ? value : 0;
  }

  function getLastMessage(room) {
    var messages = Array.isArray(room?.messages) ? room.messages : [];
    if (!messages.length) return null;

    return messages.reduce(function (latest, message) {
      if (!latest) return message;
      return getMessageTimeValue(message) >= getMessageTimeValue(latest) ? message : latest;
    }, null);
  }

  function formatAicTime(value) {
    var time = value ? new Date(value) : null;
    if (!time || Number.isNaN(time.getTime())) return '';

    var now = new Date();
    var sameDate =
      time.getFullYear() === now.getFullYear() &&
      time.getMonth() === now.getMonth() &&
      time.getDate() === now.getDate();

    var yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);

    var isYesterday =
      time.getFullYear() === yesterday.getFullYear() &&
      time.getMonth() === yesterday.getMonth() &&
      time.getDate() === yesterday.getDate();

    var hh = String(time.getHours()).padStart(2, '0');
    var mm = String(time.getMinutes()).padStart(2, '0');

    if (sameDate) return hh + ':' + mm;
    if (isYesterday) return '어제';
    return String(time.getMonth() + 1) + '/' + String(time.getDate());
  }

  function formatMessageTime(value) {
    var time = value ? new Date(value) : null;
    if (!time || Number.isNaN(time.getTime())) return '';

    var now = new Date();
    var sameDate =
      time.getFullYear() === now.getFullYear() &&
      time.getMonth() === now.getMonth() &&
      time.getDate() === now.getDate();

    var hh = String(time.getHours()).padStart(2, '0');
    var mm = String(time.getMinutes()).padStart(2, '0');

    if (sameDate) return hh + ':' + mm;

    return String(time.getMonth() + 1) + '/' + String(time.getDate()) + ' ' + hh + ':' + mm;
  }

  function getRoomPreviewText(room) {
    var last = getLastMessage(room);
    if (!last) return '아직 메시지가 없습니다.';

    var sender = getMessageSenderName(room, last);
    var attachment = getAttachmentFromMessage(last);
    var text = attachment ? ('📎 ' + (attachment.file_name || attachment.name || '첨부파일')) : (getPreferredMessageText(last) || last.original || last.translated || '');
    text = String(text || '').replace(/\s+/g, ' ').trim();

    if (text.length > 42) text = text.slice(0, 42) + '…';

    return (sender ? sender + ': ' : '') + text;
  }

  function getRoomLastTime(room) {
    var last = getLastMessage(room);
    return last ? formatAicTime(last.created_at) : '';
  }

  function getLastReadAt(roomId) {
    return String((state.readMap || {})[roomId] || '').trim();
  }

  function getUnreadCount(room) {
    if (!room) return 0;

    var currentEmail = String(getCurrentUserEmail() || '').trim().toLowerCase();
    var lastRead = Date.parse(getLastReadAt(room.id) || '');
    if (!Number.isFinite(lastRead)) lastRead = 0;

    return (room.messages || []).filter(function (message) {
      var senderEmail = String(message.sender_email || '').trim().toLowerCase();
      if (senderEmail && currentEmail && senderEmail === currentEmail) return false;

      var created = getMessageTimeValue(message);
      return created > lastRead;
    }).length;
  }

  function markRoomRead(roomId) {
    var room = getRoom(roomId);
    if (!room) return;

    var last = getLastMessage(room);
    if (!last) return;

    var value = last.created_at || new Date().toISOString();
    var current = Date.parse(state.readMap[roomId] || '');
    var next = Date.parse(value || '');

    if (Number.isFinite(current) && Number.isFinite(next) && current >= next) return;

    state.readMap[roomId] = value;
    saveRoomReadToServer(roomId, value);
  }

  function markVisibleRoomsRead() {
    (state.openSlots || []).forEach(function (slot) {
      if (slot && slot.roomId) markRoomRead(slot.roomId);
    });
  }

  function getPortalSession() {
    try {
      if (window.parent && window.parent !== window && typeof window.parent.getPortalSession === 'function') {
        return window.parent.getPortalSession() || {};
      }
    } catch (_) {}

    try {
      if (window.parent && window.parent !== window) {
        return window.parent.portalSession || window.parent.currentPortalSession || {};
      }
    } catch (_) {}

    return window.portalSession || window.currentPortalSession || {};
  }

  function getSupabaseClient() {
    try {
      var session = getPortalSession();
      if (session && session.supabase) return session.supabase;
    } catch (_) {}

    try {
      if (window.parent && window.parent.portalSupabase) {
        return window.parent.portalSupabase;
      }
    } catch (_) {}

    if (window.portalSupabase) return window.portalSupabase;
    if (window.aicSupabase) return window.aicSupabase;

    return null;
  }

  function getCompanyId() {
    var session = getPortalSession();
    var auth = window.aicAuth || {};
    var user = auth.user || {};
    var company = auth.company || session.activeCompany || session.active_company || session.company || {};
    return String(
      session.activeCompanyId ||
      session.active_company_id ||
      session.selectedCompanyId ||
      session.selected_company_id ||
      session.companyId ||
      session.company_id ||
      session.company?.id ||
      session.company?.company_id ||
      session.profile?.company_id ||
      company.id ||
      company.company_id ||
      user.company_id ||
      user.companyId ||
      window.currentCompanyId ||
      ''
    ).trim();
  }

  function getCurrentUserEmail() {
    var auth = window.aicAuth || {};
    var user = auth.user || {};
    var session = getPortalSession();

    return String(
      user.email ||
      user.user_email ||
      session.email ||
      session.user?.email ||
      session.profile?.email ||
      ''
    ).trim();
  }

  function getCurrentUserName() {
    var auth = window.aicAuth || {};
    var user = auth.user || {};
    var session = getPortalSession();

    return (
      user.name ||
      session.profile?.name ||
      session.user?.name ||
      session.user_name ||
      session.name ||
      (getCurrentUserEmail() ? getCurrentUserEmail().split('@')[0] : '') ||
      '사용자'
    );
  }

  function normalizeRoleValue(value) {
    return String(value == null ? '' : value).trim().toLowerCase();
  }

  function collectRoleValues(source, output) {
    if (!source) return;

    if (Array.isArray(source)) {
      source.forEach(function (item) {
        collectRoleValues(item, output);
      });
      return;
    }

    if (typeof source === 'object') {
      [
        'role',
        'roles',
        'app_role',
        'app_roles',
        'authority',
        'authorities',
        'permission',
        'permissions',
        'user_role',
        'user_roles',
        'userType',
        'user_type',
        'account_type',
        'type'
      ].forEach(function (key) {
        if (Object.prototype.hasOwnProperty.call(source, key)) {
          collectRoleValues(source[key], output);
        }
      });
      return;
    }

    var value = normalizeRoleValue(source);
    if (value) output.push(value);
  }

  function getCurrentUserRoleValues() {
    var session = getPortalSession();
    var auth = window.aicAuth || {};
    var user = auth.user || {};
    var profile = session.profile || {};
    var values = [];

    [
      auth,
      user,
      profile,
      session,
      session.user,
      session.employee,
      session.currentEmployee,
      session.portalSession,
      window.portalSession,
      window.currentPortalSession
    ].forEach(function (source) {
      collectRoleValues(source, values);
    });

    return values.filter(Boolean);
  }

  function isAicSystemAdmin() {
    var email = String(getCurrentUserEmail() || '').trim().toLowerCase();
    var session = getPortalSession();
    var auth = window.aicAuth || {};
    var user = auth.user || {};
    var profile = session.profile || {};

    var explicitFlags = [
      auth.isSystemAdmin,
      auth.is_system_admin,
      user.isSystemAdmin,
      user.is_system_admin,
      profile.isSystemAdmin,
      profile.is_system_admin,
      session.isSystemAdmin,
      session.is_system_admin,
      session.isServiceAdmin,
      session.is_service_admin
    ];

    if (explicitFlags.some(function (value) { return value === true || value === 'true' || value === 1 || value === '1'; })) {
      return true;
    }

    var roleValues = getCurrentUserRoleValues();
    var systemAdminKeywords = [
      'system_admin',
      'system-admin',
      'systemadmin',
      'sysadmin',
      'super_admin',
      'super-admin',
      'superadmin',
      'service_admin',
      'service-admin',
      'serviceadmin',
      'portal_admin',
      'portal-admin',
      'portaladmin',
      '시스템관리자',
      '서비스관리자'
    ];

    if (roleValues.some(function (role) {
      return systemAdminKeywords.some(function (keyword) {
        return role === keyword || role.indexOf(keyword) >= 0;
      });
    })) {
      return true;
    }

    // 현재 포탈의 서비스관리자 계정 규칙: 예) zipiz-admin@exelolab.com
    if (email && /-admin@/i.test(email)) return true;

    return false;
  }


  function isCodeLike(value) {
    var text = String(value || '').trim();
    if (!text) return false;
    return /^[A-Z]{1,5}\d{1,4}(-\d{1,4})?$/i.test(text);
  }

  function getDivisionNameByCode(code) {
    var key = String(code || '').trim();
    if (!key) return '';

    var i18nName = trKey('org.' + key, '');
    if (i18nName) return i18nName;

    return state.orgMaps.divisions[key] || '';
  }

  function getTeamNameByCode(code) {
    var key = String(code || '').trim();
    if (!key) return '';

    var i18nName = trKey('team.' + key, '');
    if (i18nName) return i18nName;

    return state.orgMaps.teams[key] || '';
  }

  function getEmployeeDepartment(row) {
    var mappedName = getDivisionNameByCode(row.division_code);
    if (mappedName) return mappedName;

    var candidates = [
      row.department_name,
      row.department,
      row.division_name,
      row.headquarters,
      row.headquarter,
      row.org_name,
      row.organization,
      row.bonbu,
      row.division
    ];

    for (var i = 0; i < candidates.length; i++) {
      var value = String(candidates[i] || '').trim();
      if (value && !isCodeLike(value)) return value;
    }

    return '';
  }

  function getEmployeeTeam(row) {
    var mappedName = getTeamNameByCode(row.team_code);
    if (mappedName) return mappedName;

    var candidates = [
      row.team,
      row.team_name,
      row.group_name,
      row.part_name,
      row.part
    ];

    for (var i = 0; i < candidates.length; i++) {
      var value = String(candidates[i] || '').trim();
      if (value && !isCodeLike(value)) return value;
    }

    return '';
  }

  function getPersonName(row) {
    var value = String(row.name || row.user_name || row.display_name || '').trim();
    if (value && value.indexOf('@') < 0) return value;
    return String(row.email || row.user_email || '').trim();
  }

  function translatePosition(row) {
    var raw = String(row.position || row.grade || row.job_title || row.title || '').trim();
    if (!raw) return '';

    var duty = String(row.duty || row.authority || '').trim();
    var divisionCode = String(row.division_code || '').trim();

    if (duty === '소장') {
      if (divisionCode === 'AB01') return trKey('position.소장.Global', raw);
      return trKey('position.소장.Central', raw);
    }

    if (duty === '부소장') {
      if (divisionCode === 'AB01') return trKey('position.부소장.Global', raw);
      return trKey('position.부소장.Central', raw);
    }

    if (duty === '팀장') {
      return trKey('position.팀장', raw);
    }

    return trKey('grade.' + raw, raw);
  }

  function normalizePerson(row) {
    return {
      id: row.id || row.employee_no || row.employeeNo || row.email || row.user_email || '',
      employee_no: row.employee_no || row.employeeNo || '',
      name: getPersonName(row),
      email: row.email || row.user_email || '',
      department: getEmployeeDepartment(row),
      team: getEmployeeTeam(row),
      position: translatePosition(row),
      language: row.preferred_language || row.language || 'ko',
      _searchText: [
        row.name, row.user_name, row.display_name,
        row.email, row.user_email,
        row.employee_no, row.employeeNo,
        row.division_code, getDivisionNameByCode(row.division_code),
        row.team_code, getTeamNameByCode(row.team_code),
        row.department, row.department_name,
        row.team, row.team_name,
        row.position, row.grade, row.job_title, row.title
      ].join(' ').toLowerCase()
    };
  }

  function personKey(person) {
    return String(person.email || person.id || person.name || '').trim().toLowerCase();
  }

  function memberKey(member) {
    return String(member.email || member.id || member.name || '').trim().toLowerCase();
  }

  function isSamePerson(a, b) {
    var ak = personKey(a);
    var bk = personKey(b);
    return !!ak && !!bk && ak === bk;
  }

  function isRoomCreator(room) {
    if (!room) return false;
    var creatorEmail = String(room.created_by_email || '').trim().toLowerCase();
    var currentEmail = String(getCurrentUserEmail() || '').trim().toLowerCase();
    return !!creatorEmail && !!currentEmail && creatorEmail === currentEmail;
  }

  function getCurrentUserPerson() {
    return {
      name: getCurrentUserName(),
      email: getCurrentUserEmail(),
      department: '',
      team: '',
      position: '',
      language: 'ko'
    };
  }

  function ensureCreatorIncluded(list) {
    var creator = getCurrentUserPerson();
    if (!creator.email && !creator.name) return list;
    var exists = list.some(function (item) { return isSamePerson(item, creator) || String(item.name || '') === creator.name; });
    return exists ? list : [creator].concat(list);
  }

  function uniquePeople(list) {
    var seen = {};
    return (Array.isArray(list) ? list : []).filter(function (person) {
      var key = personKey(person);
      if (!key) return false;
      if (seen[key]) return false;
      seen[key] = true;
      return true;
    });
  }

  async function loadOrgMaps() {
    var sb = getSupabaseClient();
    var companyId = getCompanyId();

    if (!sb) return;

    async function loadDivisions() {
      try {
        var query = sb
          .from('divisions')
          .select('division_code, division_name')
          .limit(500);

        if (companyId) {
          query = query.eq('company_id', companyId);
        }

        var response = await query;

        if (response.error && companyId) {
          response = await sb
            .from('divisions')
            .select('division_code, division_name')
            .limit(500);
        }

        if (!response.error && Array.isArray(response.data)) {
          response.data.forEach(function (row) {
            var code = String(row.division_code || '').trim();
            var name = String(row.division_name || '').trim();
            if (code && name) state.orgMaps.divisions[code] = name;
          });
        }
      } catch (error) {
        console.warn('[AIC ORG] divisions load skipped:', error);
      }
    }

    async function loadTeams() {
      try {
        var query = sb
          .from('teams')
          .select('team_code, team_name, division_code')
          .limit(1000);

        if (companyId) {
          query = query.eq('company_id', companyId);
        }

        var response = await query;

        if (response.error && companyId) {
          response = await sb
            .from('teams')
            .select('team_code, team_name, division_code')
            .limit(1000);
        }

        if (!response.error && Array.isArray(response.data)) {
          response.data.forEach(function (row) {
            var code = String(row.team_code || '').trim();
            var name = String(row.team_name || '').trim();
            if (code && name) state.orgMaps.teams[code] = name;
          });
        }
      } catch (error) {
        console.warn('[AIC ORG] teams load skipped:', error);
      }
    }

    await loadDivisions();
    await loadTeams();
  }

  async function searchPeople(keyword) {
    await loadOrgMaps();

    var sb = getSupabaseClient();
    var companyId = getCompanyId();
    var q = String(keyword || '').trim().toLowerCase();

    if (!sb || !q) return [];

    var results = [];

    async function runTableSearch(tableName) {
      try {
        var query = sb
          .from(tableName)
          .select('*')
          .limit(200);

        if (companyId) {
          query = query.eq('company_id', companyId);
        }

        var response = await query;

        if (response.error || !Array.isArray(response.data)) {
          console.warn('[AIC SEARCH]', tableName, response.error);
          return;
        }

        response.data.forEach(function (row) {
          var person = normalizePerson(row);

          var searchTarget = [
            person.name,
            person.email,
            person.department,
            person.team,
            person.position,
            person.employee_no,
            person._searchText
          ].join(' ').toLowerCase();

          if (searchTarget.indexOf(q) >= 0) {
            results.push(person);
          }
        });

      } catch (error) {
        console.warn('[AIC SEARCH]', tableName, error);
      }
    }

    await runTableSearch('employees');
    await runTableSearch('users');
    await runTableSearch('profiles');

    return uniquePeople(results).slice(0, 50);
  }

  async function loadPeopleIndex() {
    await loadOrgMaps();

    var sb = getSupabaseClient();
    var companyId = getCompanyId();
    var people = [];

    if (!sb) return { byEmail: {}, byName: {} };

    async function loadTable(tableName) {
      try {
        var query = sb.from(tableName).select('*').limit(500);
        if (companyId) query = query.eq('company_id', companyId);

        var response = await query;
        if (!response.error && Array.isArray(response.data)) {
          response.data.forEach(function (row) {
            people.push(normalizePerson(row));
          });
        }
      } catch (_) {}
    }

    await loadTable('employees');
    await loadTable('users');
    await loadTable('profiles');

    people = uniquePeople(people);

    var byEmail = {};
    var byName = {};

    people.forEach(function (person) {
      var emailKey = String(person.email || '').trim().toLowerCase();
      var nameKey = String(person.name || '').trim().toLowerCase();

      if (emailKey && !byEmail[emailKey]) byEmail[emailKey] = person;
      if (nameKey && !byName[nameKey]) byName[nameKey] = person;
    });

    return { byEmail: byEmail, byName: byName };
  }

  function enrichMemberRow(member, peopleIndex) {
    var emailKey = String(member.user_email || member.email || '').trim().toLowerCase();
    var nameKey = String(member.user_name || member.name || '').trim().toLowerCase();

    var person = (emailKey && peopleIndex.byEmail[emailKey]) ||
      (nameKey && peopleIndex.byName[nameKey]) ||
      null;

    if (!person) return member;

    return Object.assign({}, member, {
      user_name: person.name || member.user_name || member.user_email || '',
      user_email: person.email || member.user_email || '',
      department: person.department || member.department || '',
      team: person.team || member.team || '',
      position: person.position || member.position || ''
    });
  }

  function showDbWarn(message) {
    console.warn('[AIC DB]', message);
  }

  function normalizeDbRoom(row, membersByRoom, messagesByRoom) {
    var roomId = String(row.id || '');
    var members = membersByRoom[roomId] || [];
    var messages = messagesByRoom[roomId] || [];
    var currentEmail = getCurrentUserEmail();

    return {
      id: roomId,
      name: row.name || '회의방',
      created_by_email: row.created_by_email || '',
      created_by_name: row.created_by_name || '',
      members: members.map(function (member) {
        return member.user_name || member.user_email || '';
      }).filter(Boolean).join(' · '),
      memberList: members.map(function (member) {
        return {
          id: member.id || '',
          name: member.user_name || member.user_email || '',
          email: member.user_email || '',
          department: member.department || member.division || member.headquarters || '',
          team: member.team || member.team_name || '',
          position: member.position || member.job_title || '',
          role: member.role || '',
          language: member.language || 'ko'
        };
      }),
      messages: messages.map(function (message) {
        var senderEmail = String(message.sender_email || '').trim();
        var original = message.original || '';
        return {
          id: message.id || '',
          type: senderEmail && currentEmail && senderEmail === currentEmail ? 'me' : 'other',
          sender: message.sender_name || senderEmail || '상대방',
          sender_email: senderEmail,
          original: original,
          translated: message.translated || '',
          source_lang: message.source_lang || detectTextLanguage(original),
          translations: normalizeTranslations(message.translations),
          attachment: getAttachmentFromMessage({ translations: message.translations }),
          created_at: message.created_at || ''
        };
      })
    };
  }

  async function loadRoomsFromServer(options) {
    options = options || {};
    var sb = getSupabaseClient();
    var companyId = getCompanyId();
    var currentEmail = String(getCurrentUserEmail() || '').trim();
    var isSystemAdmin = isAicSystemAdmin();

    if (!sb || !companyId) {
      state.dbReady = false;
      state.rooms = [];
      render(false);
      return;
    }

    state.dbLoading = true;

    try {
      var roomRows = [];
      var roomIds = [];

      if (isSystemAdmin) {
        var roomsResult = await sb
          .from('aic_rooms')
          .select('*')
          .eq('company_id', companyId)
          .order('updated_at', { ascending: false })
          .order('created_at', { ascending: false });

        if (roomsResult.error) throw roomsResult.error;

        roomRows = Array.isArray(roomsResult.data) ? roomsResult.data : [];
        roomIds = roomRows.map(function (room) { return String(room.id || ''); }).filter(Boolean);
      } else {
        if (!currentEmail) {
          state.readMap = {};
          state.readSyncReady = true;
          state.rooms = [];
          state.openSlots = [];
          state.dbReady = true;
          if (!options.skipRealtime) {
            subscribeRealtime();
            subscribeReadRealtime();
          }
          render(false);
          return;
        }

        var myMembersResult = await sb
          .from('aic_room_members')
          .select('room_id')
          .eq('company_id', companyId)
          .ilike('user_email', currentEmail);

        if (myMembersResult.error) {
          myMembersResult = await sb
            .from('aic_room_members')
            .select('room_id')
            .eq('company_id', companyId)
            .eq('user_email', currentEmail);
        }

        if (myMembersResult.error) throw myMembersResult.error;

        roomIds = (myMembersResult.data || [])
          .map(function (member) { return String(member.room_id || ''); })
          .filter(Boolean);

        roomIds = Array.from(new Set(roomIds));

        if (roomIds.length) {
          var participantRoomsResult = await sb
            .from('aic_rooms')
            .select('*')
            .eq('company_id', companyId)
            .in('id', roomIds)
            .order('updated_at', { ascending: false })
            .order('created_at', { ascending: false });

          if (participantRoomsResult.error) throw participantRoomsResult.error;

          roomRows = Array.isArray(participantRoomsResult.data) ? participantRoomsResult.data : [];
          roomIds = roomRows.map(function (room) { return String(room.id || ''); }).filter(Boolean);
        }
      }

      if (!roomIds.length) {
        state.readMap = {};
        state.readSyncReady = true;
        state.rooms = [];
        state.openSlots = [];
        state.dbReady = true;
        if (!options.skipRealtime) {
          subscribeRealtime();
          subscribeReadRealtime();
        }
        render(false);
        return;
      }

      var membersResult = await sb
        .from('aic_room_members')
        .select('*')
        .eq('company_id', companyId)
        .in('room_id', roomIds)
        .order('created_at', { ascending: true });

      if (membersResult.error) throw membersResult.error;

      var messagesResult = await sb
        .from('aic_messages')
        .select('*')
        .eq('company_id', companyId)
        .in('room_id', roomIds)
        .order('created_at', { ascending: true });

      if (messagesResult.error) throw messagesResult.error;

      await loadReadMapFromServer(roomIds);

      var peopleIndex = await loadPeopleIndex();
      var enrichedMembers = (membersResult.data || []).map(function (member) {
        return enrichMemberRow(member, peopleIndex);
      });

      var membersByRoom = {};
      enrichedMembers.forEach(function (member) {
        var roomId = String(member.room_id || '');
        if (!membersByRoom[roomId]) membersByRoom[roomId] = [];
        membersByRoom[roomId].push(member);
      });

      var messagesByRoom = {};
      (messagesResult.data || []).forEach(function (message) {
        var roomId = String(message.room_id || '');
        if (!messagesByRoom[roomId]) messagesByRoom[roomId] = [];
        messagesByRoom[roomId].push(message);
      });

      state.rooms = roomRows.map(function (row) {
        return normalizeDbRoom(row, membersByRoom, messagesByRoom);
      });

      state.openSlots = state.openSlots.filter(function (slot) {
        return slot && getRoom(slot.roomId);
      });

      state.dbReady = true;
      if (!options.skipRealtime) {
        subscribeRealtime();
        subscribeReadRealtime();
      }
      render(true);
    } catch (error) {
      state.dbReady = false;
      showDbWarn(error?.message || error);
      state.rooms = [];
      state.openSlots = [];
      render(false);
      alert('AIC 서버 데이터 조회 실패: Supabase 테이블 생성 SQL을 먼저 실행했는지 확인해 주세요.\n\n' + (error?.message || ''));
    } finally {
      state.dbLoading = false;
    }
  }

  async function insertRoomToServer(room) {
    var sb = getSupabaseClient();
    var companyId = getCompanyId();
    if (!sb || !companyId || !room) return;

    var now = new Date().toISOString();
    var userEmail = getCurrentUserEmail();
    var userName = getCurrentUserName();

    var roomResult = await sb.from('aic_rooms').insert({
      id: room.id,
      company_id: companyId,
      name: room.name,
      created_by_email: userEmail,
      created_by_name: userName,
      created_at: now,
      updated_at: now
    });

    if (roomResult.error) throw roomResult.error;

    var members = getRoomMembers(room);
    if (!members.length) {
      members = [{ name: userName, email: userEmail }];
      room.memberList = members;
      syncRoomMembersText(room);
    }

    var memberRows = members.map(function (member) {
      return {
        company_id: companyId,
        room_id: room.id,
        user_name: member.name || member.email || '',
        user_email: member.email || '',
        department: member.department || '',
        team: member.team || '',
        position: member.position || '',
        role: member.role || '',
        language: member.language || 'ko'
      };
    });

    if (memberRows.length) {
      var memberResult = await sb.from('aic_room_members').insert(memberRows);
      if (memberResult.error) throw memberResult.error;
    }
  }

  async function insertMessageToServer(room, message) {
    var sb = getSupabaseClient();
    var companyId = getCompanyId();
    if (!sb || !companyId || !room || !message) return;

    var messageTranslations = normalizeTranslations(message.translations);
    var messageAttachment = getAttachmentFromMessage(message);
    if (messageAttachment) {
      messageTranslations.__attachment = messageAttachment;
    }

    var messageResult = await sb.from('aic_messages').insert({
      company_id: companyId,
      room_id: room.id,
      sender_name: message.sender || getCurrentUserName(),
      sender_email: getCurrentUserEmail(),
      original: message.original || '',
      translated: message.translated || '',
      source_lang: message.source_lang || detectTextLanguage(message.original || ''),
      translations: messageTranslations
    }).select('id, created_at, sender_name, sender_email, original, translated, source_lang, translations, room_id').maybeSingle();

    if (messageResult.error) throw messageResult.error;

    if (messageResult.data) {
      message.id = messageResult.data.id || message.id;
      message.created_at = messageResult.data.created_at || message.created_at;
      message.source_lang = messageResult.data.source_lang || message.source_lang;
      message.translations = normalizeTranslations(messageResult.data.translations || message.translations);
      message.attachment = getAttachmentFromMessage(message);
    }

    try {
      await sb
        .from('aic_rooms')
        .update({ updated_at: new Date().toISOString() })
        .eq('company_id', companyId)
        .eq('id', room.id);
    } catch (_) {}

    return messageResult.data || null;
  }

  async function insertParticipantToServer(room, member) {
    var sb = getSupabaseClient();
    var companyId = getCompanyId();
    if (!sb || !companyId || !room || !member) return null;

    var result = await sb.from('aic_room_members').insert({
      company_id: companyId,
      room_id: room.id,
      user_name: member.name || member.email || '',
      user_email: member.email || '',
      department: member.department || '',
      team: member.team || '',
      position: member.position || '',
      role: member.role || '',
      language: member.language || 'ko'
    }).select('id').maybeSingle();

    if (result.error) throw result.error;
    return result.data?.id || null;
  }

  async function deleteParticipantFromServer(room, member) {
    var sb = getSupabaseClient();
    var companyId = getCompanyId();
    if (!sb || !companyId || !room || !member) return;

    var query = sb
      .from('aic_room_members')
      .delete()
      .eq('company_id', companyId)
      .eq('room_id', room.id);

    if (member.id) {
      query = query.eq('id', member.id);
    } else if (member.email) {
      query = query.eq('user_email', member.email);
    } else {
      query = query.eq('user_name', member.name || '');
    }

    var result = await query;
    if (result.error) throw result.error;
  }


  function getCurrentRoomMember(room) {
    var currentEmail = String(getCurrentUserEmail() || '').trim().toLowerCase();
    if (!room || !currentEmail) return null;

    return getRoomMembers(room).find(function (member) {
      return String(member.email || member.user_email || '').trim().toLowerCase() === currentEmail;
    }) || null;
  }

  function canLeaveRoom(room) {
    return !!getCurrentRoomMember(room);
  }

  async function deleteWholeRoomFromServer(room) {
    var sb = getSupabaseClient();
    var companyId = getCompanyId();
    if (!sb || !companyId || !room) return;

    try {
      var readsResult = await sb
        .from('aic_message_reads')
        .delete()
        .eq('company_id', companyId)
        .eq('room_id', room.id);

      if (readsResult.error) console.warn('[AIC LEAVE] read cleanup skipped:', readsResult.error);
    } catch (error) {
      console.warn('[AIC LEAVE] read cleanup skipped:', error);
    }

    var messagesResult = await sb
      .from('aic_messages')
      .delete()
      .eq('company_id', companyId)
      .eq('room_id', room.id);

    if (messagesResult.error) throw messagesResult.error;

    var membersResult = await sb
      .from('aic_room_members')
      .delete()
      .eq('company_id', companyId)
      .eq('room_id', room.id);

    if (membersResult.error) throw membersResult.error;

    var roomResult = await sb
      .from('aic_rooms')
      .delete()
      .eq('company_id', companyId)
      .eq('id', room.id);

    if (roomResult.error) throw roomResult.error;
  }

  async function leaveRoomFromServer(room) {
    var sb = getSupabaseClient();
    var companyId = getCompanyId();
    var currentEmail = String(getCurrentUserEmail() || '').trim();
    if (!sb || !companyId || !room || !currentEmail) return { deletedRoom: false };

    var member = getCurrentRoomMember(room);
    if (!member) {
      throw new Error('현재 사용자는 이 회의방 참여자가 아닙니다.');
    }

    try {
      var readDeleteResult = await sb
        .from('aic_message_reads')
        .delete()
        .eq('company_id', companyId)
        .eq('room_id', room.id)
        .ilike('user_email', currentEmail);

      if (readDeleteResult.error) console.warn('[AIC LEAVE] read delete skipped:', readDeleteResult.error);
    } catch (_) {}

    var deleteQuery = sb
      .from('aic_room_members')
      .delete()
      .eq('company_id', companyId)
      .eq('room_id', room.id);

    if (member.id) {
      deleteQuery = deleteQuery.eq('id', member.id);
    } else {
      deleteQuery = deleteQuery.ilike('user_email', currentEmail);
    }

    var memberDeleteResult = await deleteQuery;
    if (memberDeleteResult.error) {
      // 일부 Supabase/PostgREST 설정에서 ilike delete가 막히는 경우를 대비한 재시도
      var fallbackDeleteResult = await sb
        .from('aic_room_members')
        .delete()
        .eq('company_id', companyId)
        .eq('room_id', room.id)
        .eq('user_email', currentEmail);

      if (fallbackDeleteResult.error) throw fallbackDeleteResult.error;
    }

    var remainingResult = await sb
      .from('aic_room_members')
      .select('id')
      .eq('company_id', companyId)
      .eq('room_id', room.id)
      .limit(1);

    if (remainingResult.error) throw remainingResult.error;

    var hasRemainingMembers = Array.isArray(remainingResult.data) && remainingResult.data.length > 0;

    if (!hasRemainingMembers) {
      await deleteWholeRoomFromServer(room);
      return { deletedRoom: true };
    }

    return { deletedRoom: false };
  }

  async function leaveRoom(roomId) {
    var room = getRoom(roomId);
    if (!room) return;

    var memberCount = getRoomMembers(room).length;
    var message = memberCount <= 1
      ? '이 회의방을 나가시겠습니까?\n마지막 참여자라서 회의방과 메시지가 함께 삭제됩니다.'
      : '이 회의방을 나가시겠습니까?\n내 회의방 목록에서만 사라지고, 다른 참여자는 계속 사용할 수 있습니다.';

    var ok = confirm(message);
    if (!ok) return;

    try {
      await leaveRoomFromServer(room);
    } catch (error) {
      alert('회의방 나가기 실패: ' + (error?.message || 'Supabase 권한/테이블을 확인해 주세요.'));
      return;
    }

    state.rooms = state.rooms.filter(function (item) {
      return item.id !== roomId;
    });

    state.openSlots = state.openSlots.filter(function (slot) {
      return slot && slot.roomId !== roomId;
    });

    delete state.readMap[roomId];

    if (state.activeSlotIndex >= state.openSlots.length) {
      state.activeSlotIndex = Math.max(0, state.openSlots.length - 1);
    }

    render(false);
  }

  function getRealtimeChannelName() {
    var companyId = getCompanyId();
    return companyId ? ('aic-chat-' + companyId) : '';
  }

  function scheduleRealtimeReconnect(delay) {
    clearTimeout(state.realtimeResubscribeTimer);
    state.realtimeResubscribeTimer = setTimeout(function () {
      state.realtimeSubscribing = false;
      state.realtimeReady = false;
      state.realtimeChannel = null;
      state.realtimeChannelName = '';
      subscribeRealtime({ force: true });
    }, Number(delay) || 800);
  }

  function getReadRealtimeChannelName() {
    var companyId = getCompanyId();
    var email = String(getCurrentUserEmail() || '').trim().toLowerCase().replace(/[^a-z0-9_@.-]/g, '_');
    return companyId && email ? ('aic-read-' + companyId + '-' + email) : '';
  }

  function scheduleReadRealtimeReconnect(delay) {
    clearTimeout(state.readRealtimeResubscribeTimer);
    state.readRealtimeResubscribeTimer = setTimeout(function () {
      state.readRealtimeSubscribing = false;
      state.readRealtimeReady = false;
      state.readRealtimeChannel = null;
      state.readRealtimeChannelName = '';
      subscribeReadRealtime({ force: true });
    }, Number(delay) || 1000);
  }

  function subscribeReadRealtime(options) {
    var force = !!(options && options.force);
    var sb = getSupabaseClient();
    var companyId = getCompanyId();
    var email = String(getCurrentUserEmail() || '').trim();

    if (!sb || !companyId || !email || typeof sb.channel !== 'function') return;

    var baseChannelName = getReadRealtimeChannelName();
    if (!baseChannelName) return;

    // 같은 사용자/회사 read realtime이 이미 살아 있으면 다시 붙이지 않습니다.
    // Supabase는 subscribe() 이후 같은 채널에 postgres_changes 콜백을 추가하면 오류가 납니다.
    if (!force && state.readRealtimeChannel && state.readRealtimeChannelBaseName === baseChannelName) {
      return;
    }

    if (!force && state.readRealtimeSubscribing && state.readRealtimeChannelBaseName === baseChannelName) {
      return;
    }

    unsubscribeReadRealtime();

    state.readRealtimeSubscribing = true;
    state.readRealtimeReady = false;
    state.readRealtimeChannelBaseName = baseChannelName;
    state.readRealtimeSeq = (Number(state.readRealtimeSeq) || 0) + 1;

    // 실제 Supabase 채널명은 매번 고유하게 생성합니다.
    // removeChannel이 비동기로 정리되는 순간에 같은 이름을 재사용하면
    // "cannot add postgres_changes callbacks after subscribe()" 오류가 날 수 있습니다.
    var channelName = baseChannelName + '-' + getAicClientId() + '-' + state.readRealtimeSeq;
    state.readRealtimeChannelName = channelName;

    try {
      var channel = sb
        .channel(channelName)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'aic_message_reads',
            filter: 'company_id=eq.' + companyId
          },
          function (payload) {
            handleReadRealtimeChange(payload.new || payload.old || {});
          }
        );

      state.readRealtimeChannel = channel;

      channel.subscribe(function (status) {
        if (status === 'SUBSCRIBED') {
          state.readRealtimeReady = true;
          state.readRealtimeSubscribing = false;
          return;
        }

        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          console.warn('[AIC READ Realtime]', status);
          state.readRealtimeReady = false;
          state.readRealtimeSubscribing = false;

          if (state.readRealtimeChannelBaseName === baseChannelName) {
            scheduleReadRealtimeReconnect(1500);
          }
        }
      });
    } catch (error) {
      // read realtime은 보조 기능입니다.
      // 실패해도 채팅/회의방 조회는 계속 동작해야 하므로 alert를 띄우지 않습니다.
      console.warn('[AIC READ Realtime] subscribe skipped:', error);
      state.readRealtimeReady = false;
      state.readRealtimeSubscribing = false;
      state.readRealtimeChannel = null;
      state.readRealtimeChannelName = '';
      state.readRealtimeChannelBaseName = '';
    }
  }

  function unsubscribeReadRealtime() {
    var sb = getSupabaseClient();

    clearTimeout(state.readRealtimeResubscribeTimer);
    state.readRealtimeResubscribeTimer = null;

    if (state.readRealtimeChannel && sb && typeof sb.removeChannel === 'function') {
      try {
        sb.removeChannel(state.readRealtimeChannel);
      } catch (_) {}
    }

    state.readRealtimeChannel = null;
    state.readRealtimeChannelName = '';
    state.readRealtimeChannelBaseName = '';
    state.readRealtimeReady = false;
    state.readRealtimeSubscribing = false;
  }

  function handleReadRealtimeChange(row) {
    if (!row || !row.room_id) return;

    var currentEmail = String(getCurrentUserEmail() || '').trim().toLowerCase();
    var rowEmail = String(row.user_email || '').trim().toLowerCase();

    if (!currentEmail || !rowEmail || currentEmail !== rowEmail) return;

    var roomId = String(row.room_id || '').trim();
    var nextValue = row.last_read_at || '';
    var current = Date.parse(state.readMap[roomId] || '');
    var next = Date.parse(nextValue || '');

    if (!roomId || !Number.isFinite(next)) return;
    if (Number.isFinite(current) && current >= next) return;

    state.readMap[roomId] = nextValue;
    renderRoomList();
  }

  function subscribeRealtime(options) {
    var force = !!(options && options.force);
    var sb = getSupabaseClient();
    var companyId = getCompanyId();

    if (!sb || !companyId || typeof sb.channel !== 'function') return;

    var baseChannelName = getRealtimeChannelName();
    if (!baseChannelName) return;

    // 이미 같은 회사 채팅 realtime을 구독 중이면 postgres_changes 콜백을 다시 붙이지 않습니다.
    if (!force && state.realtimeChannel && state.realtimeChannelBaseName === baseChannelName) {
      return;
    }

    if (!force && state.realtimeSubscribing && state.realtimeChannelBaseName === baseChannelName) {
      return;
    }

    unsubscribeRealtime();

    state.realtimeSubscribing = true;
    state.realtimeReady = false;
    state.realtimeChannelBaseName = baseChannelName;
    state.realtimeSeq = (Number(state.realtimeSeq) || 0) + 1;

    // 실제 채널명은 고유하게 생성해서 기존 subscribe 완료 채널 재사용 충돌을 피합니다.
    var channelName = baseChannelName + '-' + getAicClientId() + '-' + state.realtimeSeq;
    state.realtimeChannelName = channelName;

    try {
      var channel = sb
        .channel(channelName)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'aic_messages',
            filter: 'company_id=eq.' + companyId
          },
          function (payload) {
            handleRealtimeMessage(payload.new || {});
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'aic_room_members',
            filter: 'company_id=eq.' + companyId
          },
          function () {
            loadRoomsFromServer({ skipRealtime: true });
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'DELETE',
            schema: 'public',
            table: 'aic_rooms',
            filter: 'company_id=eq.' + companyId
          },
          function () {
            loadRoomsFromServer({ skipRealtime: true });
          }
        );

      state.realtimeChannel = channel;

      channel.subscribe(function (status) {
        if (status === 'SUBSCRIBED') {
          state.realtimeReady = true;
          state.realtimeSubscribing = false;
          return;
        }

        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          console.warn('[AIC Realtime]', status);
          state.realtimeReady = false;
          state.realtimeSubscribing = false;

          if (state.realtimeChannelBaseName === baseChannelName) {
            scheduleRealtimeReconnect(1200);
          }
        }
      });
    } catch (error) {
      console.warn('[AIC Realtime] subscribe skipped:', error);
      state.realtimeReady = false;
      state.realtimeSubscribing = false;
      state.realtimeChannel = null;
      state.realtimeChannelName = '';
      state.realtimeChannelBaseName = '';
    }
  }

  function unsubscribeRealtime() {
    var sb = getSupabaseClient();

    clearTimeout(state.realtimeResubscribeTimer);
    state.realtimeResubscribeTimer = null;

    if (state.realtimeChannel && sb && typeof sb.removeChannel === 'function') {
      try {
        sb.removeChannel(state.realtimeChannel);
      } catch (_) {}
    }

    state.realtimeChannel = null;
    state.realtimeChannelName = '';
    state.realtimeChannelBaseName = '';
    state.realtimeReady = false;
    state.realtimeSubscribing = false;
  }

  function handleRealtimeMessage(row) {
    if (!row || !row.room_id) return;

    var roomId = String(row.room_id || '');
    var room = getRoom(roomId);

    if (!room) {
      loadRoomsFromServer();
      return;
    }

    var message = normalizeDbMessage(row);

    room.messages = Array.isArray(room.messages) ? room.messages : [];

    var tempIndex = room.messages.findIndex(function (item) {
      if (String(item.id || '').indexOf('temp_') !== 0) return false;

      var itemEmail = String(item.sender_email || '').trim().toLowerCase();
      var messageEmail = String(message.sender_email || '').trim().toLowerCase();

      if (itemEmail && messageEmail && itemEmail === messageEmail &&
        String(item.original || '').trim() === String(message.original || '').trim()) {
        return true;
      }

      return String(item.sender || '').trim() === String(message.sender || '').trim() &&
        String(item.original || '').trim() === String(message.original || '').trim();
    });

    if (tempIndex >= 0) {
      room.messages[tempIndex] = message;
    } else {
      if (hasMessage(room, message)) return;
      room.messages.push(message);
    }

    // 최신 메시지가 들어온 회의방을 목록 상단으로 이동합니다.
    state.rooms = [room].concat(state.rooms.filter(function (item) {
      return item.id !== room.id;
    }));

    if (getOpenSlotIndex(room.id) >= 0) {
      markRoomRead(room.id);
    }

    render(false);
  }

  function getToneLabel(value) {
    return ({
      business: '비즈니스 영어',
      meeting: '간단 회의 영어',
      polite: '정중한 이메일식 영어',
      casual: '캐주얼 대화식 영어'
    })[value] || '비즈니스 영어';
  }

  function fakeTranslate(text, lang) {
    if (!String(text || '').trim()) return '';
    if (!state.settings.autoTranslate) return tr('aic.autoTranslateOff', '자동번역 OFF 상태입니다.');

    var tone = getToneLabel(state.settings.tone);
    if (lang === 'ko') return '[' + tone + '] Preview translation: ' + text;
    return '[' + tone + '] ' + tr('aic.previewTranslation', '미리보기 번역') + ': ' + text;
  }

  function getRoom(roomId) {
    return state.rooms.find(function (room) { return room.id === roomId; }) || null;
  }

  function getOpenSlotIndex(roomId) {
    return state.openSlots.findIndex(function (slot) { return slot && slot.roomId === roomId; });
  }

  function getStableLayoutWidth() {
    var candidates = [];

    if (els && els.slots && els.slots.clientWidth) {
      candidates.push(els.slots.clientWidth);
    }

    if (els && els.root && els.root.clientWidth) {
      candidates.push(Math.max(0, els.root.clientWidth - 280));
    }

    if (document.documentElement && document.documentElement.clientWidth) {
      candidates.push(document.documentElement.clientWidth);
    }

    if (window.innerWidth) {
      candidates.push(window.innerWidth);
    }

    candidates = candidates.filter(function (width) {
      return Number(width) && width > 120;
    });

    if (!candidates.length) return window.innerWidth || 1024;

    // iframe 전환 순간에 clientWidth가 비정상적으로 작게 잡히는 것을 피하기 위해
    // 가장 큰 유효 폭을 기준으로 슬롯 수를 계산합니다.
    return Math.max.apply(null, candidates);
  }

  function getMaxSlotsByWidth() {
    var width = getStableLayoutWidth();
    var policy = CONFIG.slotPolicy;

    if (width < policy.mobileBreakpoint) return policy.mobileMaxSlots;
    if (width < policy.notebookBreakpoint) return policy.notebookMaxSlots;
    return policy.maxVisibleSlots;
  }

  function normalizeSlotCount() {
    return Math.max(1, Math.min(
      Number(state.preferredSlotCount) || CONFIG.slotPolicy.defaultVisibleSlots,
      getMaxSlotsByWidth(),
      CONFIG.slotPolicy.maxVisibleSlots
    ));
  }

  function isMobileAicView() {
    return window.matchMedia && window.matchMedia('(max-width: 760px)').matches;
  }

  function syncMobileAicView() {
    if (!els.root) return;

    var hasOpenRoom = state.openSlots && state.openSlots.length > 0;

    els.root.classList.toggle('aic-mobile-list-view', isMobileAicView() && !hasOpenRoom);
    els.root.classList.toggle('aic-mobile-chat-view', isMobileAicView() && hasOpenRoom);
  }

  function backToMobileRoomList() {
    if (!isMobileAicView()) return;
    state.openSlots = [];
    state.activeSlotIndex = 0;
    render(false);
  }

  function ensureSlots(fill) {
    state.visibleSlotCount = normalizeSlotCount();

    while (state.openSlots.length > state.visibleSlotCount) {
      state.openSlots.pop();
    }

    // AIC 진입 시 자동으로 첫 회의방을 열지 않습니다.
    // 사용자가 직접 회의방을 클릭했을 때만 슬롯이 열립니다.
    if (fill === true && state.openSlots.length) {
      while (state.openSlots.length < state.visibleSlotCount && state.openSlots.length < state.rooms.length) {
        var room = state.rooms.find(function (r) {
          return getOpenSlotIndex(r.id) < 0;
        });
        if (!room) break;
        state.openSlots.push({ roomId: room.id, pinned: false });
      }
    }

    if (state.activeSlotIndex >= state.openSlots.length) {
      state.activeSlotIndex = Math.max(0, state.openSlots.length - 1);
    }

    document.documentElement.style.setProperty('--aic-visible-slots', String(state.visibleSlotCount));
  }

  function openRoom(roomId) {
    var existing = getOpenSlotIndex(roomId);
    markRoomRead(roomId);

    if (existing >= 0) {
      state.activeSlotIndex = existing;
      render();
      return;
    }

    if (state.openSlots.length < state.visibleSlotCount) {
      state.openSlots.push({ roomId: roomId, pinned: false });
      state.activeSlotIndex = state.openSlots.length - 1;
      render();
      return;
    }

    var target = state.activeSlotIndex;

    if (state.openSlots[target] && state.openSlots[target].pinned) {
      var freeIndex = state.openSlots.findIndex(function (slot) { return !slot.pinned; });
      if (freeIndex >= 0) target = freeIndex;
      else return;
    }

    state.openSlots[target] = { roomId: roomId, pinned: false };
    state.activeSlotIndex = target;
    render();
  }

  function closeSlot(index) {
    state.openSlots.splice(index, 1);
    if (state.activeSlotIndex >= state.openSlots.length) {
      state.activeSlotIndex = Math.max(0, state.openSlots.length - 1);
    }
    render(false);
  }

  function togglePin(index) {
    var slot = state.openSlots[index];
    if (!slot) return;
    slot.pinned = !slot.pinned;
    render(false);
  }

  function setPreferredSlotCount(count) {
    state.preferredSlotCount = Number(count) || 1;
    render(true);
  }

  function renderSlotButtons() {
    if (!els.slotButtons) return;

    var max = getMaxSlotsByWidth();

    els.slotButtons.innerHTML = [1, 2, 3].map(function (count) {
      return [
        '<button type="button" class="aic-slot-btn',
        state.visibleSlotCount === count ? ' active' : '',
        '" data-slot-count="', count, '"',
        count > max ? ' disabled' : '',
        '>', count, tr('aic.slotViewSuffix', '개 보기'), '</button>'
      ].join('');
    }).join('');

    Array.from(els.slotButtons.querySelectorAll('[data-slot-count]')).forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (btn.disabled) return;
        setPreferredSlotCount(Number(btn.getAttribute('data-slot-count')));
      });
    });
  }

  function renderRoomList() {
    syncMobileAicView();
    if (!els.roomList) return;

    if (!state.rooms.length) {
      els.roomList.innerHTML = '<div class="aic-empty-message">회의방이 없습니다.<br>+ 버튼으로 새 회의방을 생성하세요.</div>';
      return;
    }

    els.roomList.innerHTML = state.rooms.map(function (room) {
      var slotIndex = getOpenSlotIndex(room.id);
      var open = slotIndex >= 0;

      return [
        '<div class="aic-room-item', open ? ' active' : '', '" data-room-id="', esc(room.id), '">',
        '  <div class="aic-room-name-row">',
        '    <div class="aic-room-name">', esc(room.name), '</div>',
        '    <div class="aic-room-right-actions">',
        open ? '      <div class="aic-room-slot open">' + esc(tr('aic.open', '열림') + ' ' + (slotIndex + 1)) + '</div>' : '',
        canLeaveRoom(room) ? '      <button class="aic-room-leave" type="button" data-leave-room="' + esc(room.id) + '" title="회의방 나가기" aria-label="회의방 나가기">나가기</button>' : '',
        '    </div>',
        '  </div>',
        '  <div class="aic-room-preview-row">',
        '    <div class="aic-room-preview">', esc(getRoomPreviewText(room)), '</div>',
        getUnreadCount(room) > 0 ? '    <div class="aic-unread-badge">' + getUnreadCount(room) + '</div>' : '',
        '  </div>',
        '  <div class="aic-room-meta">', esc(room.members), getRoomLastTime(room) ? '<br>' + esc(getRoomLastTime(room)) : '', '</div>',
        '</div>'
      ].join('');
    }).join('');

    Array.from(els.roomList.querySelectorAll('[data-leave-room]')).forEach(function (btn) {
      btn.addEventListener('click', function (event) {
        event.stopPropagation();
        leaveRoom(btn.getAttribute('data-leave-room') || '');
      });
    });

    Array.from(els.roomList.querySelectorAll('[data-room-id]')).forEach(function (el) {
      el.addEventListener('click', function (event) {
        if (event.target && event.target.closest('[data-leave-room]')) return;
        openRoom(el.getAttribute('data-room-id'));
      });
    });
  }

  function buildMessage(room, msg) {
    var displayMode = state.settings.display || 'both';
    var sender = getMessageSenderName(room, msg);
    var original = String(msg?.original || '');
    var translated = getTranslationForLang(msg, getViewerLanguage()) || String(msg?.translated || '');
    var isMine = msg && msg.type === 'me';
    var preferredText = getPreferredMessageText(msg);

    if (getAttachmentFromMessage(msg)) {
      return buildAttachmentMessage(room, msg);
    }

    if (displayMode === 'original') {
      return [
        '<div class="aic-message ', isMine ? 'me' : 'other', '">',
        '  <div class="aic-message-name">', esc(sender), '</div>',
        '  <div class="aic-message-original">', esc(original), '</div>',
        buildMessageFooter(msg),
        '</div>'
      ].join('');
    }

    if (displayMode === 'translated') {
      return [
        '<div class="aic-message ', isMine ? 'me' : 'other', '">',
        '  <div class="aic-message-name">', esc(sender), '</div>',
        '  <div class="aic-message-original">', esc(isMine ? original : preferredText), '</div>',
        buildMessageFooter(msg),
        '</div>'
      ].join('');
    }

    if (isMine) {
      return [
        '<div class="aic-message me">',
        '  <div class="aic-message-name">', esc(sender), '</div>',
        '  <div class="aic-message-original">', esc(original), '</div>',
        buildMessageFooter(msg),
        '</div>'
      ].join('');
    }

    var sourceLang = normalizeAicLang(msg?.source_lang) || detectTextLanguage(original);
    var viewerLang = getViewerLanguage();
    var showTranslated = translated && translated !== original && sourceLang !== viewerLang;

    return [
      '<div class="aic-message other">',
      '  <div class="aic-message-name">', esc(sender), '</div>',
      '  <div class="aic-message-original">', esc(original), '</div>',
      showTranslated ? '  <div class="aic-message-translated">' + esc(translated) + '</div>' : '',
      buildMessageFooter(msg),
      '</div>'
    ].join('');
  }

  function renderChatSlots() {
    if (!els.slots) return;

    var html = '';

    for (var i = 0; i < state.visibleSlotCount; i++) {
      var slot = state.openSlots[i];

      if (!slot) {
        html += '<div class="aic-empty-slot">' + tr('aic.selectRoom', '회의방을 선택하세요.') + '</div>';
        continue;
      }

      var room = getRoom(slot.roomId);
      if (!room) {
        html += '<div class="aic-empty-slot">' + tr('aic.roomNotFound', '회의방 정보가 없습니다.') + '</div>';
        continue;
      }

      var messages = room.messages.map(function (message) {
        return buildMessage(room, message);
      }).join('');
      if (!messages) {
        messages = '<div class="aic-empty-message">' + tr('aic.noMessages', '아직 메시지가 없습니다.') + '<br>' + tr('aic.writeMessageGuide', '아래 입력창으로 메시지를 작성하세요.') + '</div>';
      }

      html += [
        '<section class="aic-chat-window', i === state.activeSlotIndex ? ' active' : '', '" data-slot-index="', i, '">',
        '  <div class="aic-chat-head">',
        '    <button class="aic-mobile-back-btn" data-mobile-back="1" type="button">← 목록</button>',
        '    <div class="aic-chat-title-box">',
        '      <div class="aic-chat-title">', esc(room.name), '</div>',
        '      <div class="aic-chat-meta">', esc(room.members), ' · ', i + 1, tr('aic.slotNumberSuffix', '번 슬롯') + '</div>',
        '    </div>',
        '    <div class="aic-chat-actions">',
        '      <button class="aic-chat-action pin', slot.pinned ? ' active' : '', '" data-pin-slot="', i, '" type="button">', slot.pinned ? tr('aic.pinned', '고정됨') : tr('aic.pin', '고정'), '</button>',
        '      <button class="aic-chat-action" data-invite-slot="', i, '" type="button">', tr('aic.participants', '참여자'), '</button>',
        '      <button class="aic-chat-action dark" data-close-slot="', i, '" type="button">', tr('aic.close', '닫기'), '</button>',
        '    </div>',
        '  </div>',
        '  <div class="aic-messages" data-message-box="', i, '">', messages, '</div>',
        '  <div class="aic-chat-input" style="position:relative; display:flex; align-items:center; gap:8px;">',
        '    <button class="module-btn aic-attach-toggle" data-attach-toggle-slot="', i, '" type="button" title="첨부" aria-label="첨부" style="flex:0 0 42px; width:42px; min-width:42px; max-width:42px; height:38px; padding:0; font-size:20px; font-weight:900; line-height:1;">+</button>',
        '    <div class="aic-attach-menu" data-attach-menu-slot="', i, '" hidden style="position:absolute; left:0; bottom:48px; z-index:50; min-width:132px; padding:8px; border:1px solid #e2e8f0; border-radius:12px; background:#fff; box-shadow:0 12px 30px rgba(15,23,42,.16);">',
        '      <button class="module-btn aic-attach-file-btn" data-attach-file-slot="', i, '" type="button" style="width:100%; justify-content:flex-start; white-space:nowrap;">첨부파일</button>',
        '    </div>',
        '    <input type="file" data-attach-input-slot="', i, '" hidden />',
        '    <input class="module-input" data-input-slot="', i, '" placeholder="', tr('aic.inputPlaceholder', '메시지를 입력하세요'), '" style="flex:1 1 auto; min-width:0; width:auto;" />',
        '    <button class="module-btn accent aic-send-btn" data-send-slot="', i, '" type="button" style="flex:0 0 72px; width:72px; min-width:72px; max-width:72px; white-space:nowrap;">', tr('aic.send', '전송'), '</button>',
        '  </div>',
        '</section>'
      ].join('');
    }

    els.slots.innerHTML = html;

    // 채팅창 전체 mousedown 재렌더링 제거
    // 입력창/버튼/select 클릭 시 DOM이 다시 그려져 타이핑과 버튼 클릭이 끊기는 문제를 방지합니다.
    Array.from(els.slots.querySelectorAll('[data-slot-index]')).forEach(function (win) {
      win.addEventListener('click', function (event) {
        if (event.target && event.target.closest('input, textarea, select, button, [contenteditable="true"]')) {
          return;
        }

        var nextIndex = Number(win.getAttribute('data-slot-index')) || 0;
        if (state.activeSlotIndex === nextIndex) return;

        state.activeSlotIndex = nextIndex;
        Array.from(els.slots.querySelectorAll('[data-slot-index]')).forEach(function (item) {
          item.classList.toggle('active', Number(item.getAttribute('data-slot-index')) === state.activeSlotIndex);
        });
      });
    });

    Array.from(els.slots.querySelectorAll('input, textarea, select, button')).forEach(function (control) {
      ['mousedown', 'mouseup', 'click', 'touchstart', 'touchend'].forEach(function (eventName) {
        control.addEventListener(eventName, function (event) {
          event.stopPropagation();
        });
      });
    });

    Array.from(els.slots.querySelectorAll('[data-mobile-back]')).forEach(function (btn) {
      btn.addEventListener('click', function (event) {
        event.stopPropagation();
        backToMobileRoomList();
      });
    });

    Array.from(els.slots.querySelectorAll('[data-attach-toggle-slot]')).forEach(function (btn) {
      btn.addEventListener('click', function (event) {
        event.stopPropagation();
        var slotIndex = Number(btn.getAttribute('data-attach-toggle-slot')) || 0;
        Array.from(els.slots.querySelectorAll('[data-attach-menu-slot]')).forEach(function (menu) {
          var menuSlotIndex = Number(menu.getAttribute('data-attach-menu-slot')) || 0;
          if (menuSlotIndex === slotIndex) {
            menu.hidden = !menu.hidden;
          } else {
            menu.hidden = true;
          }
        });
      });
    });

    Array.from(els.slots.querySelectorAll('[data-attach-file-slot]')).forEach(function (btn) {
      btn.addEventListener('click', function (event) {
        event.stopPropagation();
        var slotIndex = Number(btn.getAttribute('data-attach-file-slot')) || 0;
        var fileInput = els.slots.querySelector('[data-attach-input-slot="' + slotIndex + '"]');
        var menu = els.slots.querySelector('[data-attach-menu-slot="' + slotIndex + '"]');
        if (menu) menu.hidden = true;
        if (fileInput) fileInput.click();
      });
    });

    Array.from(els.slots.querySelectorAll('[data-attach-input-slot]')).forEach(function (input) {
      input.addEventListener('change', function (event) {
        var slotIndex = Number(input.getAttribute('data-attach-input-slot')) || 0;
        var file = event.target && event.target.files && event.target.files[0] ? event.target.files[0] : null;
        input.value = '';
        if (!file) return;
        sendAttachmentMessage(slotIndex, file);
      });
    });

    Array.from(els.slots.querySelectorAll('[data-attachment-action]')).forEach(function (btn) {
      btn.addEventListener('click', function (event) {
        event.stopPropagation();
        var filePath = btn.getAttribute('data-attachment-path') || '';
        var fileName = btn.getAttribute('data-attachment-name') || '첨부파일';
        var action = btn.getAttribute('data-attachment-action') || 'preview';
        var kind = btn.getAttribute('data-attachment-kind') || '';
        openAicAttachment(filePath, fileName, action, kind);
      });
    });

    Array.from(els.slots.querySelectorAll('[data-send-slot]')).forEach(function (btn) {
      btn.addEventListener('click', function () {
        sendMessage(Number(btn.getAttribute('data-send-slot')) || 0);
      });
    });

    Array.from(els.slots.querySelectorAll('[data-input-slot]')).forEach(function (input) {
      input.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') {
          sendMessage(Number(input.getAttribute('data-input-slot')) || 0);
        }
      });
    });

    Array.from(els.slots.querySelectorAll('[data-close-slot]')).forEach(function (btn) {
      btn.addEventListener('click', function (event) {
        event.stopPropagation();
        closeSlot(Number(btn.getAttribute('data-close-slot')) || 0);
      });
    });

    Array.from(els.slots.querySelectorAll('[data-pin-slot]')).forEach(function (btn) {
      btn.addEventListener('click', function (event) {
        event.stopPropagation();
        togglePin(Number(btn.getAttribute('data-pin-slot')) || 0);
      });
    });

    Array.from(els.slots.querySelectorAll('[data-invite-slot]')).forEach(function (btn) {
      btn.addEventListener('click', function (event) {
        event.stopPropagation();
        openParticipantsModal(Number(btn.getAttribute('data-invite-slot')) || 0);
      });
    });

    Array.from(els.slots.querySelectorAll('[data-message-box]')).forEach(function (box) {
      box.scrollTop = box.scrollHeight;
    });

    markVisibleRoomsRead();
  }

  async function sendAttachmentMessage(slotIndex, file) {
    var slot = state.openSlots[slotIndex];
    if (!slot) return;

    var room = getRoom(slot.roomId);
    if (!room) return;
    if (!file) return;

    var tempId = 'temp_file_' + Date.now() + '_' + Math.random().toString(16).slice(2);
    var message = {
      id: tempId,
      type: 'me',
      sender: getCurrentUserName(),
      sender_email: getCurrentUserEmail(),
      original: file.name || '첨부파일',
      translated: '',
      source_lang: 'file',
      translations: {},
      attachment: {
        file_name: file.name || '첨부파일',
        file_path: '',
        file_size: file.size || 0,
        mime_type: file.type || 'application/octet-stream'
      },
      created_at: new Date().toISOString()
    };

    room.messages.push(message);
    markRoomRead(room.id);
    render(false);

    try {
      var attachment = await uploadAicAttachmentFile(room, file);
      message.attachment = attachment;
      message.original = attachment.file_name || message.original;
      message.translations = normalizeTranslations(message.translations);
      message.translations.__attachment = attachment;
      render(false);

      await insertMessageToServer(room, message);
      await insertAttachmentToServer(room, message, attachment);
      render(false);
    } catch (error) {
      room.messages = (room.messages || []).filter(function (item) {
        return item.id !== tempId;
      });
      render(false);
      alert('첨부파일 업로드 실패: ' + (error?.message || 'Storage 버킷/RLS 정책을 확인해 주세요.'));
    }
  }

  async function sendMessage(slotIndex) {
    var slot = state.openSlots[slotIndex];
    if (!slot) return;

    var room = getRoom(slot.roomId);
    if (!room) return;

    var input = els.slots.querySelector('[data-input-slot="' + slotIndex + '"]');
    var text = input ? input.value.trim() : '';

    if (!text) return;

    if (input) input.value = '';

    var tempId = 'temp_' + Date.now() + '_' + Math.random().toString(16).slice(2);
    var message = {
      id: tempId,
      type: 'me',
      sender: getCurrentUserName(),
      sender_email: getCurrentUserEmail(),
      original: text,
      translated: tr('aic.searching', '검색 중입니다...'),
      source_lang: detectTextLanguage(text),
      translations: {},
      created_at: new Date().toISOString()
    };

    room.messages.push(message);
    markRoomRead(room.id);
    render(false);

    try {
      var translationResult = await translateWithAi(text, detectTextLanguage(text), room);
      message.translated = translationResult.translated || '';
      message.source_lang = translationResult.source_lang || message.source_lang || detectTextLanguage(text);
      message.translations = normalizeTranslations(translationResult.translations);
      render(false);

      await insertMessageToServer(room, message);
    } catch (error) {
      alert('메시지 저장 실패: ' + (error?.message || 'Supabase 연결/테이블을 확인해 주세요.'));
    }
  }

  function splitMembers(value) {
    return String(value || '')
      .split('·')
      .map(function (item) { return item.trim(); })
      .filter(Boolean);
  }

  function getRoomMembers(room) {
    if (!room) return [];
    if (!Array.isArray(room.memberList)) {
      room.memberList = splitMembers(room.members).map(function (name) {
        return { name: name, email: '' };
      });
    }
    return room.memberList;
  }

  function getDisplayName(person) {
    return String(person.name || person.email || '').trim();
  }

  function getMessageSenderName(room, msg) {
    var fallback = String(msg?.sender || '').trim() || (msg?.type === 'me' ? getCurrentUserName() : '상대방');
    var senderEmail = String(msg?.sender_email || '').trim().toLowerCase();

    if (room && senderEmail) {
      var members = getRoomMembers(room);
      var matched = members.find(function (member) {
        return String(member.email || '').trim().toLowerCase() === senderEmail;
      });

      if (matched && String(matched.name || '').trim()) {
        return String(matched.name || '').trim();
      }
    }

    // 이메일 앞부분이나 시스템 아이디처럼 저장된 이름이면, 현재 사용자 정보에서 한 번 더 보정
    var currentEmail = String(getCurrentUserEmail() || '').trim().toLowerCase();
    if (senderEmail && currentEmail && senderEmail === currentEmail) {
      var currentName = String(getCurrentUserName() || '').trim();
      if (currentName && currentName.indexOf('@') < 0) return currentName;
    }

    return fallback;
  }

  function syncRoomMembersText(room) {
    if (!room) return;
    room.members = getRoomMembers(room).map(function (member) {
      return getDisplayName(member);
    }).filter(Boolean).join(' · ');
  }

  function renderPersonMeta(person) {
    var orgText = [person.department, person.team, person.position]
      .filter(function (value) {
        return value && !isCodeLike(value);
      })
      .join(' / ');

    if (orgText) return orgText;

    return person.email || tr('aic.noParticipantMemo', '부서/팀 정보 없음');
  }

  function buildSearchResultRow(person, context, selectedList) {
    var checked = selectedList.some(function (item) { return isSamePerson(item, person); });
    return [
      '<label class="aic-user-row">',
      '  <input type="checkbox" data-pick-person-context="', context, '" data-pick-person="', esc(personKey(person)), '"', checked ? ' checked' : '', ' />',
      '  <div>',
      '    <div class="aic-user-name">', esc(person.name || person.email || '-'), '</div>',
      '    <div class="aic-user-meta">', esc(renderPersonMeta(person)), '</div>',
      '  </div>',
      '</label>'
    ].join('');
  }

  function buildSelectedChip(person, context) {
    return [
      '<div class="aic-selected-chip">',
      '  <div>',
      '    <div class="aic-participant-name">', esc(person.name || person.email || '-'), '</div>',
      '    <div class="aic-participant-meta">', esc(renderPersonMeta(person)), '</div>',
      '  </div>',
      '  <button class="aic-selected-remove" type="button" data-remove-selected-context="', context, '" data-remove-selected="', esc(personKey(person)), '">', tr('aic.delete', '삭제'), '</button>',
      '</div>'
    ].join('');
  }

  function renderRoomParticipantPicker() {
    if (els.roomSelectedCount) els.roomSelectedCount.textContent = String(state.selectedRoomParticipants.length);

    if (els.roomSelectedParticipants) {
      if (!state.selectedRoomParticipants.length) {
        els.roomSelectedParticipants.innerHTML = '<div class="aic-participant-empty">' + tr('aic.noSelectedParticipants', '선택된 참여자가 없습니다.') + '</div>';
      } else {
        els.roomSelectedParticipants.innerHTML = state.selectedRoomParticipants.map(function (person) {
          return buildSelectedChip(person, 'room');
        }).join('');
      }
    }

    bindPickerRemoveButtons();
  }

  function renderInviteParticipantPicker() {
    if (els.inviteSelectedCount) els.inviteSelectedCount.textContent = String(state.selectedInviteParticipants.length);

    if (els.inviteSelectedParticipants) {
      if (!state.selectedInviteParticipants.length) {
        els.inviteSelectedParticipants.innerHTML = '<div class="aic-participant-empty">' + tr('aic.noSelectedParticipants', '선택된 참여자가 없습니다.') + '</div>';
      } else {
        els.inviteSelectedParticipants.innerHTML = state.selectedInviteParticipants.map(function (person) {
          return buildSelectedChip(person, 'invite');
        }).join('');
      }
    }

    bindPickerRemoveButtons();
  }

  function bindPickerRemoveButtons() {
    Array.from(document.querySelectorAll('[data-remove-selected-context]')).forEach(function (btn) {
      if (btn.dataset.bound) return;
      btn.dataset.bound = '1';
      btn.addEventListener('click', function () {
        var context = btn.getAttribute('data-remove-selected-context');
        var key = btn.getAttribute('data-remove-selected');

        if (context === 'room') {
          state.selectedRoomParticipants = state.selectedRoomParticipants.filter(function (person) {
            return personKey(person) !== key;
          });
          renderRoomParticipantPicker();
          renderSearchResults('room');
        } else {
          state.selectedInviteParticipants = state.selectedInviteParticipants.filter(function (person) {
            return personKey(person) !== key;
          });
          renderInviteParticipantPicker();
          renderSearchResults('invite');
        }
      });
    });
  }

  function renderSearchResults(context) {
    var resultsEl = context === 'room' ? els.roomParticipantResults : els.inviteParticipantResults;
    var results = context === 'room' ? state.roomSearchResults : state.inviteSearchResults;
    var selected = context === 'room' ? state.selectedRoomParticipants : state.selectedInviteParticipants;

    if (!resultsEl) return;

    if (!results.length) {
      resultsEl.innerHTML = '<div class="aic-participant-empty">' + tr('aic.noSearchResults', '검색 결과가 없습니다.') + '</div>';
      return;
    }

    resultsEl.innerHTML = results.map(function (person) {
      return buildSearchResultRow(person, context, selected);
    }).join('');

    Array.from(resultsEl.querySelectorAll('[data-pick-person-context]')).forEach(function (input) {
      input.addEventListener('change', function () {
        var key = input.getAttribute('data-pick-person');
        var source = context === 'room' ? state.roomSearchResults : state.inviteSearchResults;
        var person = source.find(function (item) { return personKey(item) === key; });
        if (!person) return;

        if (context === 'room') {
          if (input.checked) {
            state.selectedRoomParticipants = uniquePeople(state.selectedRoomParticipants.concat([person]));
          } else {
            state.selectedRoomParticipants = state.selectedRoomParticipants.filter(function (item) { return personKey(item) !== key; });
          }
          renderRoomParticipantPicker();
        } else {
          if (input.checked) {
            state.selectedInviteParticipants = uniquePeople(state.selectedInviteParticipants.concat([person]));
          } else {
            state.selectedInviteParticipants = state.selectedInviteParticipants.filter(function (item) { return personKey(item) !== key; });
          }
          renderInviteParticipantPicker();
        }
      });
    });
  }

  async function runParticipantSearch(context) {
    var input = context === 'room' ? els.roomParticipantSearch : els.inviteParticipantSearch;
    var resultsEl = context === 'room' ? els.roomParticipantResults : els.inviteParticipantResults;
    var keyword = String(input?.value || '').trim();

    if (!keyword) {
      if (resultsEl) resultsEl.innerHTML = '<div class="aic-participant-empty">' + tr('aic.searchParticipantGuide', '검색어를 입력해 참여자를 찾으세요.') + '</div>';
      return;
    }

    if (resultsEl) resultsEl.innerHTML = '<div class="aic-participant-empty">' + tr('aic.searching', '검색 중입니다...') + '</div>';

    try {
      var results = await searchPeople(keyword);
      if (context === 'room') state.roomSearchResults = results;
      else state.inviteSearchResults = results;
      renderSearchResults(context);
    } catch (error) {
      if (resultsEl) resultsEl.innerHTML = '<div class="aic-participant-empty">' + esc(error?.message || '검색 실패') + '</div>';
    }
  }

  function openParticipantsModal(slotIndex) {
    var slot = state.openSlots[slotIndex];
    if (!slot) return;

    var room = getRoom(slot.roomId);
    if (!room || !els.participantsModal) return;

    state.activeParticipantsRoomId = room.id;
    state.selectedInviteParticipants = [];
    state.inviteSearchResults = [];
    if (els.inviteParticipantSearch) els.inviteParticipantSearch.value = '';

    renderParticipantsModal();
    renderInviteParticipantPicker();

    if (els.inviteParticipantResults) {
      els.inviteParticipantResults.innerHTML = '<div class="aic-participant-empty">' + tr('aic.searchParticipantGuide', '검색어를 입력해 참여자를 찾으세요.') + '</div>';
    }

    els.participantsModal.hidden = false;
    setTimeout(function () {
      if (els.inviteParticipantSearch) els.inviteParticipantSearch.focus();
    }, 50);
  }

  function closeParticipantsModal() {
    if (els.participantsModal) els.participantsModal.hidden = true;
    state.activeParticipantsRoomId = '';
    state.selectedInviteParticipants = [];
    state.inviteSearchResults = [];
  }

  function renderParticipantsModal() {
    var room = getRoom(state.activeParticipantsRoomId);
    if (!room) return;

    var members = getRoomMembers(room);

    if (els.participantsRoomName) {
      els.participantsRoomName.textContent = room.name + ' · ' + members.length + '명';
    }

    if (!els.participantsList) return;

    if (!members.length) {
      els.participantsList.innerHTML = '<div class="aic-participant-empty">' + tr('aic.noParticipants', '등록된 참여자가 없습니다.') + '</div>';
      return;
    }

    els.participantsList.innerHTML = members.map(function (member, index) {
      return [
        '<div class="aic-participant-item">',
        '  <div>',
        '    <div class="aic-participant-name">', esc(member.name || member.email || '-'), '</div>',
        '    <div class="aic-participant-meta">', esc(renderPersonMeta(member)), '</div>',
        '  </div>',
        '  <button class="aic-participant-remove" type="button" data-remove-participant="', index, '">', tr('aic.delete', '삭제'), '</button>',
        '</div>'
      ].join('');
    }).join('');

    Array.from(els.participantsList.querySelectorAll('[data-remove-participant]')).forEach(function (btn) {
      btn.addEventListener('click', function () {
        removeParticipant(Number(btn.getAttribute('data-remove-participant')) || 0);
      });
    });
  }

  async function addParticipant() {
    var room = getRoom(state.activeParticipantsRoomId);
    if (!room) return;

    var members = getRoomMembers(room);
    var candidates = state.selectedInviteParticipants.filter(function (person) {
      return !members.some(function (member) { return isSamePerson(member, person); });
    });

    if (!candidates.length) {
      alert(tr('aic.selectParticipantsFirst', '추가할 참여자를 선택해 주세요.'));
      return;
    }

    try {
      for (var i = 0; i < candidates.length; i++) {
        var member = Object.assign({}, candidates[i]);
        var savedId = await insertParticipantToServer(room, member);
        if (savedId) member.id = savedId;
        members.push(member);
      }
    } catch (error) {
      alert('참여자 저장 실패: ' + (error?.message || 'Supabase 연결/테이블을 확인해 주세요.'));
      return;
    }

    state.selectedInviteParticipants = [];
    state.inviteSearchResults = [];
    if (els.inviteParticipantSearch) els.inviteParticipantSearch.value = '';
    syncRoomMembersText(room);

    renderParticipantsModal();
    renderInviteParticipantPicker();
    if (els.inviteParticipantResults) {
      els.inviteParticipantResults.innerHTML = '<div class="aic-participant-empty">' + tr('aic.searchParticipantGuide', '검색어를 입력해 참여자를 찾으세요.') + '</div>';
    }
    render(false);
  }

  async function removeParticipant(index) {
    var room = getRoom(state.activeParticipantsRoomId);
    if (!room) return;

    var members = getRoomMembers(room);
    var member = members[index];
    if (!member) return;

    try {
      await deleteParticipantFromServer(room, member);
    } catch (error) {
      alert('참여자 삭제 실패: ' + (error?.message || 'Supabase 연결/테이블을 확인해 주세요.'));
      return;
    }

    members.splice(index, 1);
    syncRoomMembersText(room);

    renderParticipantsModal();
    render(false);
  }


  function openRoomModal() {
    if (!els.roomModal) return;
    state.selectedRoomParticipants = [];
    state.roomSearchResults = [];
    if (els.roomParticipantSearch) els.roomParticipantSearch.value = '';
    if (els.roomParticipantResults) {
      els.roomParticipantResults.innerHTML = '<div class="aic-participant-empty">' + tr('aic.searchParticipantGuide', '검색어를 입력해 참여자를 찾으세요.') + '</div>';
    }
    renderRoomParticipantPicker();
    els.roomModal.hidden = false;
    setTimeout(function () {
      if (els.newRoomName) els.newRoomName.focus();
    }, 50);
  }

  function closeRoomModal() {
    if (els.roomModal) els.roomModal.hidden = true;
    state.selectedRoomParticipants = [];
    state.roomSearchResults = [];
  }

  async function createRoom() {
    var name = (els.newRoomName && els.newRoomName.value || '').trim() || tr('aic.newRoomDefaultName', '새 회의방');
    var id = 'room_' + Date.now();

    var selectedMembers = ensureCreatorIncluded(state.selectedRoomParticipants);

    var room = {
      id: id,
      name: name,
      created_by_email: getCurrentUserEmail(),
      created_by_name: getCurrentUserName(),
      members: selectedMembers.map(function (member) { return getDisplayName(member); }).filter(Boolean).join(' · '),
      memberList: selectedMembers,
      messages: []
    };

    try {
      await insertRoomToServer(room);
    } catch (error) {
      alert('회의방 저장 실패: ' + (error?.message || 'Supabase 연결/테이블을 확인해 주세요.'));
      return;
    }

    state.rooms.unshift(room);

    if (els.newRoomName) els.newRoomName.value = '';

    state.selectedRoomParticipants = [];
    state.roomSearchResults = [];

    closeRoomModal();
    openRoom(id);
  }

  function openSettingsModal() {
    if (!els.settingsModal) return;

    state.settings = normalizeSettings(state.settings);
    if (els.setDefaultLang) els.setDefaultLang.value = state.settings.defaultLang;
    if (els.setDirection) els.setDirection.value = state.settings.direction;
    if (els.setTone) els.setTone.value = state.settings.tone;
    if (els.setDisplay) els.setDisplay.value = state.settings.display;
    if (els.autoSwitch) els.autoSwitch.classList.toggle('on', !!state.settings.autoTranslate);
    els.settingsModal.hidden = false;
  }

  function closeSettingsModal() {
    if (els.settingsModal) els.settingsModal.hidden = true;
  }

  function saveSettings() {
    state.settings.defaultLang = els.setDefaultLang ? els.setDefaultLang.value : state.settings.defaultLang;
    state.settings.display = els.setDisplay ? els.setDisplay.value : state.settings.display;
    state.settings.direction = 'auto';
    state.settings.tone = 'business';
    state.settings.autoTranslate = true;
    state.settings = normalizeSettings(state.settings);

    saveSettingsToLocal();
    closeSettingsModal();
    render(false);
  }

  function bind() {
    if (els.createRoomBtn) els.createRoomBtn.addEventListener('click', openRoomModal);
    if (els.roomCancelBtn) els.roomCancelBtn.addEventListener('click', closeRoomModal);
    if (els.roomCreateBtn) els.roomCreateBtn.addEventListener('click', createRoom);

    if (els.settingsBtn) els.settingsBtn.addEventListener('click', openSettingsModal);
    if (els.settingsCancelBtn) els.settingsCancelBtn.addEventListener('click', closeSettingsModal);
    if (els.settingsSaveBtn) els.settingsSaveBtn.addEventListener('click', saveSettings);

    if (els.participantsCloseBtn) els.participantsCloseBtn.addEventListener('click', closeParticipantsModal);
    if (els.participantAddBtn) els.participantAddBtn.addEventListener('click', addParticipant);

    if (els.roomParticipantSearchBtn) els.roomParticipantSearchBtn.addEventListener('click', function () { runParticipantSearch('room'); });
    if (els.roomParticipantSearch) {
      els.roomParticipantSearch.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') runParticipantSearch('room');
      });
    }

    if (els.inviteParticipantSearchBtn) els.inviteParticipantSearchBtn.addEventListener('click', function () { runParticipantSearch('invite'); });
    if (els.inviteParticipantSearch) {
      els.inviteParticipantSearch.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') runParticipantSearch('invite');
      });
    }

    if (els.participantsModal) {
      els.participantsModal.addEventListener('click', function (event) {
        if (event.target === els.participantsModal) closeParticipantsModal();
      });
    }

    if (els.autoSwitch) {
      els.autoSwitch.addEventListener('click', function () {
        els.autoSwitch.classList.toggle('on');
      });
    }

    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        render(true);
      }, 120);
    });

    window.addEventListener('message', function (event) {
      var data = event && event.data ? event.data : {};
      if (data.type === 'portal-auth') {
        unsubscribeRealtime();
            loadRoomsFromServer();
        scheduleRender();
        return;
      }

      if (
        data.type === 'portal-tabs-request' ||
        data.type === 'portal-frame-active' ||
        data.type === 'portal-layout-refresh'
      ) {
        scheduleRender();
      }
    });

    window.addEventListener('load', scheduleRender);
    window.addEventListener('pageshow', scheduleRender);
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) {
        scheduleRender();
        subscribeRealtime();
      } else {
        // 모바일 브라우저에서 백그라운드 전환 시 채널이 애매하게 남는 경우가 있어 정리합니다.
        unsubscribeRealtime();
      }
    });

    window.addEventListener('beforeunload', function () {
      unsubscribeRealtime();
    });
  }

  function cacheEls() {
    els.root = $('aicRoot');
    els.roomList = $('aicRoomList');
    els.slots = $('aicChatSlots');
    els.slotButtons = $('aicSlotButtons');

    els.createRoomBtn = $('aicCreateRoomBtn');
    els.settingsBtn = $('aicSettingsBtn');

    els.roomModal = $('aicRoomModal');
    els.newRoomName = $('aicNewRoomName');
    els.newRoomMembers = $('aicNewRoomMembers');
    els.roomCancelBtn = $('aicRoomCancelBtn');
    els.roomCreateBtn = $('aicRoomCreateConfirmBtn');

    els.settingsModal = $('aicSettingsModal');
    els.setDefaultLang = $('aicSetDefaultLang');
    els.setDirection = $('aicSetDirection');
    els.setTone = $('aicSetTone');
    els.setDisplay = $('aicSetDisplay');
    els.autoSwitch = $('aicAutoTranslateSwitch');
    els.settingsCancelBtn = $('aicSettingsCancelBtn');
    els.settingsSaveBtn = $('aicSettingsSaveBtn');

    els.roomParticipantSearch = $('aicRoomParticipantSearch');
    els.roomParticipantSearchBtn = $('aicRoomParticipantSearchBtn');
    els.roomParticipantResults = $('aicRoomParticipantResults');
    els.roomSelectedParticipants = $('aicRoomSelectedParticipants');
    els.roomSelectedCount = $('aicRoomSelectedCount');

    els.participantsModal = $('aicParticipantsModal');
    els.participantsRoomName = $('aicParticipantsRoomName');
    els.participantsList = $('aicParticipantsList');
    els.inviteParticipantSearch = $('aicInviteParticipantSearch');
    els.inviteParticipantSearchBtn = $('aicInviteParticipantSearchBtn');
    els.inviteParticipantResults = $('aicInviteParticipantResults');
    els.inviteSelectedParticipants = $('aicInviteSelectedParticipants');
    els.inviteSelectedCount = $('aicInviteSelectedCount');
    els.participantAddBtn = $('aicParticipantAddBtn');
    els.participantsCloseBtn = $('aicParticipantsCloseBtn');
  }

  function render(fill) {
    ensureSlots(fill !== false);
    renderSlotButtons();
    renderRoomList();
    renderChatSlots();
    syncMobileAicView();
  }

  function scheduleRender() {
    clearTimeout(resizeTimer);

    requestAnimationFrame(function () {
      render(true);

      requestAnimationFrame(function () {
        render(true);
      });
    });

    // iframe 전환 직후 포탈 레이아웃이 안정된 뒤 다시 계산
    resizeTimer = setTimeout(function () {
      render(true);
    }, 180);

    setTimeout(function () {
      render(true);
    }, 520);
  }

  window.aicRender = scheduleRender;
  window.aicReloadFromServer = function aicReloadFromServer() {
    return loadOrgMaps().then(function () {
      return loadRoomsFromServer({ skipRealtime: false });
    }).catch(function (error) {
      console.warn('[AIC] reload skipped:', error);
    });
  };

  function bootstrap() {
    cacheEls();
    bind();

    if (window.I18N && typeof window.I18N.changeLanguage === 'function' && !window.I18N.__aicPatched) {
      var originalChangeLanguage = window.I18N.changeLanguage.bind(window.I18N);
      window.I18N.changeLanguage = function (lang) {
        return Promise.resolve(originalChangeLanguage(lang)).then(function (result) {
          scheduleRender();
          return result;
        });
      };
      window.I18N.__aicPatched = true;
    }

    scheduleRender();
    loadOrgMaps().then(function () {
      loadRoomsFromServer();
    });

    if (window.aicNotifyTabsReady) {
      window.aicNotifyTabsReady();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
})();
