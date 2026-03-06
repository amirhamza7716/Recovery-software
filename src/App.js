import { useState, useEffect, useCallback } from 'react';
import './App.css';

// Always read fresh — not cached at module load time
const api = new Proxy({}, {
  get: (_, key) => window.electronAPI?.[key]?.bind?.(window.electronAPI),
});
const hasApi = () => !!window.electronAPI;

const SCREENS = {
  HOME: 'home',
  PHONE_CONNECT: 'phone_connect',
  PHONE_XHIDE: 'phone_xhide',
  SELECT: 'select',
  SCAN_OPTIONS: 'scan_options',
  SCANNING: 'scanning',
  RESULTS: 'results',
  RESTORING: 'restoring',
  DONE: 'done',
};

function formatSize(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB';
  return (bytes / 1073741824).toFixed(2) + ' GB';
}

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString();
}

// ─── HOME ────────────────────────────────────────────────────────────────────
function HomeScreen({ onSelect }) {
  return (
    <div className="screen home-screen">
      <div className="home-hero">
        <div className="hero-icon">🔍</div>
        <h1>Phone & Memory Card Recovery</h1>
        <p>Recover lost and hidden images, videos & files from your devices</p>
      </div>
      <div className="home-cards">
        <button className="recovery-card featured" onClick={() => onSelect('xhide')}>
          <span className="card-badge">Infinix XHide</span>
          <span className="card-icon">🔐</span>
          <h3>Recover XHide Files</h3>
          <p>Recover images & videos locked inside Infinix XHide protected vault</p>
          <span className="card-arrow">→</span>
        </button>
        <button className="recovery-card" onClick={() => onSelect('phone')}>
          <span className="card-icon">📱</span>
          <h3>Phone Storage</h3>
          <p>Recover photos, videos & files from all phone storage via USB</p>
          <span className="card-arrow">→</span>
        </button>
        <button className="recovery-card" onClick={() => onSelect('memory')}>
          <span className="card-icon">💾</span>
          <h3>Memory Card</h3>
          <p>Recover deleted or lost data from SD cards and USB drives</p>
          <span className="card-arrow">→</span>
        </button>
        <button className="recovery-card" onClick={() => onSelect('custom')}>
          <span className="card-icon">📂</span>
          <h3>Custom Folder</h3>
          <p>Scan any folder or drive on this computer</p>
          <span className="card-arrow">→</span>
        </button>
      </div>
      <div className="home-info">
        <div className="info-item"><span>🖼️</span> Images (JPG, PNG, RAW, HEIC…)</div>
        <div className="info-item"><span>🎬</span> Videos (MP4, MOV, AVI, MKV…)</div>
        <div className="info-item"><span>📄</span> Documents (PDF, DOCX, ZIP…)</div>
      </div>
    </div>
  );
}

// ─── PHONE CONNECT ───────────────────────────────────────────────────────────
function PhoneConnectScreen({ mode, onBack, onConnected, onHome }) {
  const [adbReady, setAdbReady] = useState(null);
  const [devices, setDevices] = useState([]);
  const [selected, setSelected] = useState(null);
  const [deviceInfo, setDeviceInfo] = useState(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!hasApi()) return;
    api.adbCheck().then(({ installed }) => setAdbReady(installed));
  }, []);

  async function refresh() {
    setChecking(true);
    setError('');
    try {
      const res = await api.adbDevices();
      if (!res.success) { setError(res.error); return; }
      setDevices(res.devices);
      if (res.devices.length === 0) setError('No device found. Make sure USB debugging is ON.');
    } catch (e) {
      setError(e.message);
    } finally {
      setChecking(false);
    }
  }

  async function selectDevice(d) {
    setSelected(d);
    const info = await api.adbDeviceInfo(d.serial);
    setDeviceInfo(info);
  }

  async function proceed() {
    if (!selected) return;
    onConnected(selected.serial, deviceInfo);
  }

  const isXhide = mode === 'xhide';

  return (
    <div className="screen connect-screen">
      <div className="screen-nav">
        <button className="back-btn" onClick={onBack}>← Back</button>
        <button className="home-btn" onClick={onHome}>✕ Home</button>
      </div>
      <h2>{isXhide ? '🔐 Connect to Infinix Phone' : '📱 Connect Phone via USB'}</h2>

      {isXhide && (
        <div className="xhide-info-box">
          <strong>What is XHide?</strong>
          <p>XHide is Infinix's built-in private vault that hides and locks files with a PIN. This tool will find and recover your XHide files via ADB over USB.</p>
        </div>
      )}

      <div className="steps-guide">
        <div className="guide-step">
          <div className="guide-num">1</div>
          <div>
            <strong>Enable USB Debugging</strong>
            <span>Settings → About Phone → tap <em>Build Number</em> 7 times → Developer Options → USB Debugging ON</span>
          </div>
        </div>
        <div className="guide-step">
          <div className="guide-num">2</div>
          <div>
            <strong>Connect via USB cable</strong>
            <span>Plug your Infinix Zero 40 into this PC</span>
          </div>
        </div>
        <div className="guide-step">
          <div className="guide-num">3</div>
          <div>
            <strong>Allow USB Debugging on phone</strong>
            <span>Tap <em>"Allow"</em> on the dialog that appears on your phone</span>
          </div>
        </div>
      </div>

      {adbReady === false && (
        <div className="warning-box">
          ⚠️ ADB not found. Install it with: <code>sudo apt install adb</code>
        </div>
      )}

      {adbReady && (
        <div className="device-section">
          <div className="device-header">
            <span>Connected Devices</span>
            <button className="btn-ghost" onClick={refresh} disabled={checking}>
              {checking ? 'Checking…' : '⟳ Refresh'}
            </button>
          </div>

          {error && <div className="error-box">{error}</div>}

          <div className="device-list">
            {devices.map((d) => (
              <button
                key={d.serial}
                className={`device-item ${selected?.serial === d.serial ? 'selected' : ''}`}
                onClick={() => selectDevice(d)}
              >
                <span className="device-icon">📱</span>
                <div className="device-info">
                  <span className="device-model">
                    {selected?.serial === d.serial && deviceInfo
                      ? `${deviceInfo.brand} ${deviceInfo.model}`
                      : d.serial}
                  </span>
                  <span className="device-serial">
                    {selected?.serial === d.serial && deviceInfo
                      ? `Android ${deviceInfo.android} · ${d.serial}`
                      : 'Click to identify'}
                  </span>
                </div>
                {selected?.serial === d.serial && <span className="check">✓</span>}
              </button>
            ))}

            {devices.length === 0 && !checking && !error && (
              <div className="empty-state small">No devices detected yet</div>
            )}
          </div>

          {selected && (
            <div className="connect-actions">
              <button className="btn-primary" onClick={proceed}>
                {isXhide ? 'Find XHide Files →' : 'Scan Phone Storage →'}
              </button>
            </div>
          )}
        </div>
      )}

      {adbReady === null && <div className="loading-spinner">Checking ADB…</div>}
    </div>
  );
}

// ─── XHIDE FINDER ────────────────────────────────────────────────────────────
function XHideFinder({ serial, deviceInfo, onBack, onScan, onHome }) {
  const [searching, setSearching] = useState(false);
  const [paths, setPaths] = useState([]);
  const [selected, setSelected] = useState(null);
  const [searched, setSearched] = useState(false);

  async function findPaths() {
    setSearching(true);
    const found = await api.adbFindXhide(serial);
    setPaths(found);
    setSearched(true);
    setSearching(false);
  }

  useEffect(() => { findPaths(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="screen xhide-screen">
      <div className="screen-nav">
        <button className="back-btn" onClick={onBack}>← Back</button>
        <button className="home-btn" onClick={onHome}>✕ Home</button>
      </div>
      <div className="device-badge">
        📱 {deviceInfo ? `${deviceInfo.brand} ${deviceInfo.model}` : serial}
      </div>
      <h2>🔐 XHide Vault Scanner</h2>
      <p className="subtitle">Finding hidden protected folders on your Infinix phone…</p>

      {searching && (
        <div className="searching-state">
          <div className="scan-anim">🔍</div>
          <p>Searching for XHide vault on device…</p>
        </div>
      )}

      {searched && (
        <>
          {paths.length > 0 ? (
            <>
              <div className="found-paths">
                <p className="found-label">✅ Found {paths.length} XHide location{paths.length > 1 ? 's' : ''}:</p>
                {paths.map((p) => (
                  <button
                    key={p}
                    className={`path-item ${selected === p ? 'selected' : ''}`}
                    onClick={() => setSelected(p)}
                  >
                    <span className="path-icon">📁</span>
                    <span className="path-text">{p}</span>
                    {selected === p && <span className="check">✓</span>}
                  </button>
                ))}
              </div>

              {selected && (
                <div className="xhide-actions">
                  <div className="xhide-note">
                    <span>ℹ️</span>
                    <span>Files inside XHide are your own protected files. The app will copy them to a folder you choose on this PC.</span>
                  </div>
                  <button className="btn-primary large" onClick={() => onScan(serial, selected)}>
                    Recover Files from XHide →
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="not-found-box">
              <div style={{ fontSize: 48 }}>🔍</div>
              <h3>XHide folder not found</h3>
              <p>This could mean:</p>
              <ul>
                <li>XHide has never been used on this phone</li>
                <li>Files are stored in a custom location</li>
                <li>USB debugging access is restricted</li>
              </ul>
              <button className="btn-secondary" onClick={() => onScan(serial, '/sdcard')}>
                📱 Scan Full Phone Storage Instead
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── SELECT SOURCE (local drives) ────────────────────────────────────────────
function SelectScreen({ recoveryType, onBack, onScan, onHome }) {
  const [drives, setDrives] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    if (!hasApi()) return;
    api.getDrives().then((d) => { setDrives(d); setLoading(false); });
  }, []);

  async function handleBrowse() {
    if (!hasApi()) return;
    const dir = await api.selectDirectory();
    if (dir) onScan(dir);
  }

  async function refresh() {
    if (!hasApi()) return;
    setLoading(true);
    const d = await api.getDrives();
    setDrives(d);
    setLoading(false);
  }

  const typeIcon = (d) => {
    if (d.type === 'mtp') return '📱';
    if (d.type === 'usb') return '💾';
    return '💿';
  };

  const titles = {
    memory: '💾 Select Memory Card / USB Drive',
    phone: '📱 Select Phone Storage',
    custom: '📂 Select Folder',
  };

  return (
    <div className="screen select-screen">
      <div className="screen-nav">
        <button className="back-btn" onClick={onBack}>← Back</button>
        <button className="home-btn" onClick={onHome}>✕ Home</button>
      </div>
      <h2>{titles[recoveryType] || '📂 Select Source'}</h2>
      <p className="subtitle">Plug in your device then click Refresh — or browse manually</p>

      <div className="drive-section-header">
        <span>Detected Devices & Drives</span>
        <button className="btn-ghost" onClick={refresh}>⟳ Refresh</button>
      </div>

      {loading ? (
        <div className="loading-spinner">Detecting devices…</div>
      ) : (
        <div className="drive-list">
          {drives.length === 0 && (
            <div className="empty-state small">No devices detected. Plug in your device and click Refresh.</div>
          )}
          {drives.map((d) => (
            <button
              key={d.path}
              className={`drive-item ${selected?.path === d.path ? 'selected' : ''} ${d.type === 'mtp' ? 'mtp' : ''}`}
              onClick={() => setSelected(d)}
            >
              <span className="drive-icon">{typeIcon(d)}</span>
              <div className="drive-info">
                <span className="drive-label">{d.label || d.path}</span>
                <span className="drive-path">{d.path}{d.size ? ` · ${d.size}` : ''}</span>
              </div>
              {selected?.path === d.path && <span className="check">✓</span>}
            </button>
          ))}
        </div>
      )}

      <div className="select-actions">
        <button className="btn-secondary" onClick={handleBrowse}>📂 Browse Manually</button>
        {selected && (
          <button className="btn-primary" onClick={() => onScan(selected.path)}>
            Start Scan →
          </button>
        )}
      </div>
    </div>
  );
}

// ─── SCAN OPTIONS ─────────────────────────────────────────────────────────────
const TYPE_OPTIONS = [
  { key: 'image',    icon: '🖼️', label: 'Images',             desc: 'JPG, PNG, HEIC, RAW, BMP…' },
  { key: 'video',    icon: '🎬', label: 'Videos',             desc: 'MP4, MOV, AVI, MKV, 3GP…'  },
  { key: 'document', icon: '📄', label: 'Documents & Files',  desc: 'PDF, DOCX, ZIP, RAR, TXT…' },
];

function ScanOptionsScreen({ onBack, onScan, onHome }) {
  const [types, setTypes] = useState(new Set(['image', 'video', 'document']));

  function toggle(t) {
    setTypes((prev) => {
      const next = new Set(prev);
      next.has(t) ? next.delete(t) : next.add(t);
      return next;
    });
  }

  const selectedLabels = TYPE_OPTIONS.filter((o) => types.has(o.key)).map((o) => o.label).join(', ');

  return (
    <div className="screen scan-options-screen">
      <div className="screen-nav">
        <button className="back-btn" onClick={onBack}>← Back</button>
        <button className="home-btn" onClick={onHome}>✕ Home</button>
      </div>

      <div className="scan-options-header">
        <div className="scan-options-icon">🔍</div>
        <h2>What to Scan For?</h2>
        <p className="subtitle">Choose the file types you want to recover — select one or more</p>
      </div>

      <div className="type-cards">
        {TYPE_OPTIONS.map((opt) => {
          const sel = types.has(opt.key);
          return (
            <button
              key={opt.key}
              className={`type-card ${sel ? 'selected' : ''}`}
              onClick={() => toggle(opt.key)}
            >
              <div className={`type-card-check ${sel ? 'visible' : ''}`}>✓</div>
              <div className="type-card-icon">{opt.icon}</div>
              <div className="type-card-body">
                <span className="type-card-label">{opt.label}</span>
                <span className="type-card-desc">{opt.desc}</span>
              </div>
            </button>
          );
        })}
      </div>

      {types.size === 0 ? (
        <p className="type-warning">⚠️ Please select at least one file type</p>
      ) : (
        <p className="type-summary">
          Scanning for: <strong>{selectedLabels}</strong>
        </p>
      )}

      <button
        className="btn-primary large"
        disabled={types.size === 0}
        onClick={() => onScan([...types])}
      >
        Start Scan →
      </button>
    </div>
  );
}

// ─── SCANNING ────────────────────────────────────────────────────────────────
function ScanningScreen({ sourcePath, serial, onDone, onHome, selectedTypes }) {
  const [found, setFound] = useState(0);
  const [current, setCurrent] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!hasApi()) return;

    api.onScanProgress(({ found: f, current: c }) => {
      setFound(f);
      if (c) setCurrent(c);
    });

    const scanPromise = serial
      ? api.adbScanPath(serial, sourcePath, selectedTypes)
      : api.scanDirectory(sourcePath, selectedTypes);

    scanPromise.then((files) => {
      setDone(true);
      setTimeout(() => onDone(files), 600);
    }).catch((e) => {
      setCurrent('Error: ' + e.message);
    });

    return () => api.removeListeners('scan-progress');
  }, [sourcePath, serial, onDone]);

  return (
    <div className="screen scanning-screen">
      {!done && (
        <button className="home-btn scanning-cancel" onClick={onHome}>✕ Cancel</button>
      )}
      <div className="scan-anim">{done ? '✅' : '🔍'}</div>
      <h2>{done ? 'Scan Complete!' : 'Scanning…'}</h2>
      <p className="subtitle">
        {done ? `Found ${found} recoverable files` : (serial ? `Scanning phone: ${sourcePath}` : `Searching ${sourcePath}`)}
      </p>
      <div className="scan-pulse">
        <div className={`pulse-ring ${done ? 'done' : ''}`} />
      </div>
      <div className="scan-stats">
        <div className="stat">
          <span className="stat-num">{found}</span>
          <span className="stat-label">Files Found</span>
        </div>
      </div>
      {!done && current && (
        <p className="scan-current" title={current}>
          {current.length > 60 ? '…' + current.slice(-60) : current}
        </p>
      )}
    </div>
  );
}

// ─── RESULTS ─────────────────────────────────────────────────────────────────
function ResultsScreen({ files, serial, onBack, onRestore, onHome }) {
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState(new Set());
  const [viewMode, setViewMode] = useState('grid');
  const [previews, setPreviews] = useState({});
  const [previewFile, setPreviewFile] = useState(null);

  const counts = {
    all: files.length,
    image: files.filter((f) => f.type === 'image').length,
    video: files.filter((f) => f.type === 'video').length,
    document: files.filter((f) => f.type === 'document').length,
  };

  const visible = filter === 'all' ? files : files.filter((f) => f.type === filter);

  // True only when every file in the current tab is selected
  const allVisibleSelected = visible.length > 0 && visible.every((f) => selected.has(f.path));

  const tabNames = { all: '', image: 'Images', video: 'Videos', document: 'Files' };
  const selectAllLabel = allVisibleSelected
    ? `Deselect All${tabNames[filter] ? ' ' + tabNames[filter] : ''}`
    : `Select All${tabNames[filter] ? ' ' + tabNames[filter] : ''}`;

  function toggleFile(f) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(f.path) ? next.delete(f.path) : next.add(f.path);
      return next;
    });
  }

  // Only affects files in the current tab — other tabs remain untouched
  function toggleAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        visible.forEach((f) => next.delete(f.path));
      } else {
        visible.forEach((f) => next.add(f.path));
      }
      return next;
    });
  }

  async function loadPreview(file) {
    if (!hasApi() || !serial || previews[file.path] !== undefined) return;
    setPreviews((p) => ({ ...p, [file.path]: 'loading' }));
    const res = await api.adbPullPreview(serial, file.remotePath || file.path);
    if (res.success) {
      const ext = file.ext || 'jpg';
      const mime = file.type === 'video' ? 'video/mp4' : `image/${ext === 'jpg' ? 'jpeg' : ext}`;
      setPreviews((p) => ({ ...p, [file.path]: `data:${mime};base64,${res.data}` }));
    } else {
      setPreviews((p) => ({ ...p, [file.path]: null }));
    }
  }

  const selectedFiles = files.filter((f) => selected.has(f.path));

  return (
    <div className="screen results-screen">
      <div className="results-header">
        <div className="results-title">
          <button className="back-btn" onClick={onBack}>← Back</button>
          <h2>Recovery Results</h2>
          {serial && <span className="adb-badge">📱 Via ADB</span>}
        </div>
        <div className="results-actions">
          <button className="btn-ghost" onClick={toggleAll}>
            {selectAllLabel}
          </button>
          <button
            className="btn-primary"
            disabled={selected.size === 0}
            onClick={() => onRestore(selectedFiles)}
          >
            Restore {selected.size > 0 ? `(${selected.size})` : ''} →
          </button>
          <button className="home-btn" onClick={onHome}>✕ Home</button>
        </div>
      </div>

      <div className="filter-bar">
        {[
          { key: 'all', label: '📋 All', count: counts.all },
          { key: 'image', label: '🖼️ Images', count: counts.image },
          { key: 'video', label: '🎬 Videos', count: counts.video },
          { key: 'document', label: '📄 Files', count: counts.document },
        ].map((tab) => (
          <button
            key={tab.key}
            className={`filter-tab ${filter === tab.key ? 'active' : ''}`}
            onClick={() => setFilter(tab.key)}
          >
            {tab.label} <span className="tab-count">{tab.count}</span>
          </button>
        ))}
        <div className="view-toggle">
          <button className={viewMode === 'grid' ? 'active' : ''} onClick={() => setViewMode('grid')}>⊞</button>
          <button className={viewMode === 'list' ? 'active' : ''} onClick={() => setViewMode('list')}>☰</button>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="empty-state">No {filter} files found</div>
      ) : (
        <div className={`file-${viewMode}`}>
          {visible.map((f) => (
            <FileCard
              key={f.path}
              file={f}
              viewMode={viewMode}
              checked={selected.has(f.path)}
              onToggle={() => toggleFile(f)}
              adbPreview={serial ? previews[f.path] : undefined}
              onVisible={() => loadPreview(f)}
              onPreview={() => setPreviewFile(f)}
            />
          ))}
        </div>
      )}

      {previewFile && (
        <LightboxViewer
          file={previewFile}
          visibleFiles={visible}
          onClose={() => setPreviewFile(null)}
          previews={previews}
          serial={serial}
          onLoadPreview={loadPreview}
        />
      )}
    </div>
  );
}

function FileCard({ file, viewMode, checked, onToggle, adbPreview, onVisible, onPreview }) {
  const localUrl = file.source !== 'adb' ? `file://${file.path}` : null;
  const canPreview = file.type === 'image' || file.type === 'video';

  useEffect(() => {
    if (file.source === 'adb' && file.type === 'image' && onVisible) {
      onVisible();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const imgSrc = localUrl || (adbPreview && adbPreview !== 'loading' ? adbPreview : null);

  if (viewMode === 'list') {
    return (
      <div className={`file-list-row ${checked ? 'checked' : ''}`} onClick={onToggle}>
        <input type="checkbox" checked={checked} onChange={onToggle} onClick={(e) => e.stopPropagation()} />
        <span className="list-icon">
          {file.type === 'image' ? '🖼️' : file.type === 'video' ? '🎬' : '📄'}
        </span>
        <span className="list-name" title={file.path}>{file.name}</span>
        <span className="list-size">{formatSize(file.size)}</span>
        <span className="list-date">{formatDate(file.modified)}</span>
        {canPreview && (
          <button
            className="list-preview-btn"
            onClick={(e) => { e.stopPropagation(); onPreview(); }}
            title={file.type === 'video' ? 'Play video' : 'View image'}
          >
            {file.type === 'video' ? '▶ Play' : '👁 View'}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={`file-card ${checked ? 'checked' : ''}`} onClick={onToggle}>
      <div className="file-thumb">
        {file.type === 'image' && imgSrc ? (
          <img src={imgSrc} alt={file.name} loading="lazy" onError={(e) => { e.target.style.display = 'none'; }} />
        ) : file.type === 'video' && localUrl ? (
          <video
            src={localUrl}
            preload="metadata"
            muted
            playsInline
            className="thumb-video"
            onLoadedMetadata={(e) => { e.target.currentTime = 1; }}
          />
        ) : (
          <div className="thumb-icon">
            {file.type === 'video' ? '🎬' : file.type === 'image' ? '🖼️' : '📄'}
          </div>
        )}
        {adbPreview === 'loading' && <div className="thumb-loading" />}
        <div className={`check-overlay ${checked ? 'visible' : ''}`}>✓</div>
        {canPreview && (
          <button
            className="thumb-preview-btn"
            onClick={(e) => { e.stopPropagation(); onPreview(); }}
            title={file.type === 'video' ? 'Play video' : 'View image'}
          >
            {file.type === 'video' ? '▶' : '🔍'}
          </button>
        )}
      </div>
      <div className="file-meta">
        <span className="file-name" title={file.name}>{file.name || 'Unknown'}</span>
        <span className="file-size">{formatSize(file.size)}</span>
      </div>
    </div>
  );
}

// ─── LIGHTBOX VIEWER ─────────────────────────────────────────────────────────
function LightboxViewer({ file, visibleFiles, onClose, previews, serial, onLoadPreview }) {
  const navigable = visibleFiles.filter((f) => f.type === 'image' || f.type === 'video');
  const [idx, setIdx] = useState(() => {
    const i = navigable.findIndex((f) => f.path === file.path);
    return i >= 0 ? i : 0;
  });
  const current = navigable[idx] || file;

  useEffect(() => {
    if (serial && current.type === 'image' && !previews[current.path]) {
      onLoadPreview(current);
    }
  }, [idx]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && idx > 0) setIdx((i) => i - 1);
      if (e.key === 'ArrowRight' && idx < navigable.length - 1) setIdx((i) => i + 1);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [idx, navigable.length, onClose]); // eslint-disable-line react-hooks/exhaustive-deps

  const localUrl = current.source !== 'adb' ? `file://${current.path}` : null;
  const previewData = previews[current.path];
  const imgSrc = localUrl || (previewData && previewData !== 'loading' ? previewData : null);

  return (
    <div className="lightbox-overlay" onClick={onClose}>
      <div className="lightbox-box" onClick={(e) => e.stopPropagation()}>
        <button className="lightbox-close" onClick={onClose}>✕</button>

        {navigable.length > 1 && (
          <>
            <button
              className="lightbox-nav lightbox-prev"
              onClick={() => setIdx((i) => i - 1)}
              disabled={idx === 0}
            >‹</button>
            <button
              className="lightbox-nav lightbox-next"
              onClick={() => setIdx((i) => i + 1)}
              disabled={idx === navigable.length - 1}
            >›</button>
          </>
        )}

        <div className="lightbox-media">
          {current.type === 'image' && (
            imgSrc ? (
              <img src={imgSrc} alt={current.name} className="lightbox-img" />
            ) : (
              <div className="lightbox-placeholder">
                {previewData === 'loading' ? '⏳ Loading preview…' : '🖼️ Preview not available'}
              </div>
            )
          )}
          {current.type === 'video' && (
            localUrl ? (
              <video src={localUrl} controls autoPlay className="lightbox-video" />
            ) : (
              <div className="lightbox-placeholder">
                <div style={{ fontSize: 48, marginBottom: 12 }}>🎬</div>
                <p>Video preview not available via ADB.</p>
                <p style={{ fontSize: 13, marginTop: 6, opacity: 0.6 }}>Restore the file to your PC to watch it.</p>
              </div>
            )
          )}
        </div>

        <div className="lightbox-info">
          <span className="lightbox-name">{current.name}</span>
          <span className="lightbox-meta">{formatSize(current.size)}{current.modified ? ' · ' + formatDate(current.modified) : ''}</span>
          {navigable.length > 1 && (
            <span className="lightbox-counter">{idx + 1} / {navigable.length}</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── RESTORING ───────────────────────────────────────────────────────────────
function RestoringScreen({ files, serial, onDone, onHome }) {
  const [destPath, setDestPath] = useState('');
  const [started, setStarted] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: files.length });

  async function pickDest() {
    if (!hasApi()) return;
    const dir = await api.selectDirectory();
    if (dir) setDestPath(dir);
  }

  async function startRestore() {
    if (!hasApi() || !destPath) return;
    setStarted(true);
    api.onRestoreProgress(({ done, total }) => setProgress({ done, total }));
    if (serial) {
      await api.adbPullFiles(serial, files, destPath);
    } else {
      await api.restoreFiles(files, destPath);
    }
    api.removeListeners('restore-progress');
    setTimeout(() => onDone(files.length), 500);
  }

  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

  if (!started) {
    return (
      <div className="screen restoring-screen">
        <button className="home-btn restoring-cancel" onClick={onHome}>✕ Home</button>
        <div className="restore-setup">
          <div className="restore-icon">💾</div>
          <h2>Choose Restore Location</h2>
          <p className="subtitle">Where should the recovered files be saved on this PC?</p>
          <div className="dest-picker">
            <input
              type="text"
              className="dest-input"
              placeholder="Type a folder path or click Browse…"
              value={destPath}
              onChange={(e) => setDestPath(e.target.value)}
            />
            <button className="btn-secondary" onClick={pickDest}>Browse</button>
          </div>
          <div className="restore-summary">
            <span>📦 {files.length} files selected</span>
            <span>📊 {formatSize(files.reduce((a, f) => a + f.size, 0))} total</span>
          </div>
          {serial && (
            <div className="adb-restore-note">
              📱 Files will be pulled from your phone via USB to the selected folder
            </div>
          )}
          <button className="btn-primary large" disabled={!destPath} onClick={startRestore}>
            Start Recovery →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="screen restoring-screen">
      <div className="restore-icon">{pct === 100 ? '✅' : '📤'}</div>
      <h2>{pct === 100 ? 'Recovery Complete!' : 'Recovering Files…'}</h2>
      <p className="subtitle">{progress.done} of {progress.total} files restored</p>
      <div className="progress-bar-wrap">
        <div className="progress-bar" style={{ width: `${pct}%` }} />
      </div>
      <p className="pct-label">{pct}%</p>
    </div>
  );
}

// ─── DONE ────────────────────────────────────────────────────────────────────
function DoneScreen({ count, onRestart }) {
  return (
    <div className="screen done-screen">
      <div className="done-icon">🎉</div>
      <h2>Recovery Successful!</h2>
      <p className="subtitle">{count} files have been restored to your chosen folder.</p>
      <button className="btn-primary large" onClick={onRestart}>Start New Recovery</button>
    </div>
  );
}

// ─── SIDEBAR ─────────────────────────────────────────────────────────────────
const STEPS = [
  { key: SCREENS.HOME,          label: 'Start' },
  { key: SCREENS.PHONE_CONNECT, label: 'Connect Phone', extra: [SCREENS.PHONE_XHIDE] },
  { key: SCREENS.SELECT,        label: 'Select Source' },
  { key: SCREENS.SCAN_OPTIONS,  label: 'File Types' },
  { key: SCREENS.SCANNING,      label: 'Scan' },
  { key: SCREENS.RESULTS,       label: 'Results' },
  { key: SCREENS.RESTORING,     label: 'Restore' },
  { key: SCREENS.DONE,          label: 'Done' },
];

function Sidebar({ screen }) {
  const STEP_ORDER = [
    SCREENS.HOME,
    SCREENS.PHONE_CONNECT,
    SCREENS.PHONE_XHIDE,
    SCREENS.SELECT,
    SCREENS.SCAN_OPTIONS,
    SCREENS.SCANNING,
    SCREENS.RESULTS,
    SCREENS.RESTORING,
    SCREENS.DONE,
  ];
  const current = STEP_ORDER.indexOf(screen);

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <span>📱</span>
        <span>RecoveryPro</span>
      </div>
      <nav className="sidebar-steps">
        {STEPS.map((s, i) => {
          const stepIdx = STEP_ORDER.indexOf(s.key);
          const extras = (s.extra || []).map((e) => STEP_ORDER.indexOf(e));
          const allIdx = [stepIdx, ...extras];
          const isActive = allIdx.includes(current);
          const isDone = allIdx.every((idx) => idx < current) && !isActive;
          return (
            <div key={s.key} className={`step ${isActive ? 'active' : ''} ${isDone ? 'done' : ''}`}>
              <div className="step-dot">{isDone ? '✓' : i + 1}</div>
              <span>{s.label}</span>
            </div>
          );
        })}
      </nav>
    </aside>
  );
}

// ─── NOT IN ELECTRON WARNING ──────────────────────────────────────────────────
function NotElectronWarning() {
  return (
    <div className="not-electron-screen">
      <div className="ne-icon">⚠️</div>
      <h2>Open the Desktop App</h2>
      <p>You are viewing this in a <strong>browser</strong>, but this app only works inside the <strong>Electron desktop window</strong>.</p>
      <div className="ne-steps">
        <div className="ne-step">
          <span>1</span>
          <span>Open a terminal in the project folder</span>
        </div>
        <div className="ne-step">
          <span>2</span>
          <span>Run: <code>npm run electron:dev</code></span>
        </div>
        <div className="ne-step">
          <span>3</span>
          <span>A desktop window will open — use that, not the browser</span>
        </div>
      </div>
    </div>
  );
}

// ─── ROOT ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [screen, setScreen] = useState(SCREENS.HOME);
  const [recoveryType, setRecoveryType] = useState(null);
  const [sourcePath, setSourcePath] = useState(null);
  const [serial, setSerial] = useState(null);
  const [deviceInfo, setDeviceInfo] = useState(null);
  const [scannedFiles, setScannedFiles] = useState([]);
  const [filesToRestore, setFilesToRestore] = useState([]);
  const [restoredCount, setRestoredCount] = useState(0);
  const [selectedTypes, setSelectedTypes] = useState(['image', 'video', 'document']);

  const handleScanDone = useCallback((files) => {
    setScannedFiles(files);
    setScreen(SCREENS.RESULTS);
  }, []);

  if (!hasApi()) {
    return <NotElectronWarning />;
  }

  const go = (s) => setScreen(s);

  function handleTypeSelect(type) {
    setRecoveryType(type);
    if (type === 'xhide') {
      go(SCREENS.PHONE_CONNECT); // XHide requires ADB
    } else {
      go(SCREENS.SELECT); // phone via MTP, memory card, custom folder
    }
  }

  function handlePhoneConnected(ser, info) {
    setSerial(ser);
    setDeviceInfo(info);
    if (recoveryType === 'xhide') {
      go(SCREENS.PHONE_XHIDE);
    } else {
      setSourcePath('/sdcard');
      go(SCREENS.SCAN_OPTIONS);
    }
  }

  function handleXhideScan(ser, path) {
    setSerial(ser);
    setSourcePath(path);
    go(SCREENS.SCAN_OPTIONS);
  }

  function handleLocalScan(path) {
    setSerial(null);
    setSourcePath(path);
    go(SCREENS.SCAN_OPTIONS);
  }

  function handleScanOptions(types) {
    setSelectedTypes(types);
    go(SCREENS.SCANNING);
  }

  function handleRestore(files) {
    setFilesToRestore(files);
    go(SCREENS.RESTORING);
  }

  function handleRestoreDone(count) {
    setRestoredCount(count);
    go(SCREENS.DONE);
  }

  function handleRestart() {
    setScreen(SCREENS.HOME);
    setRecoveryType(null);
    setSourcePath(null);
    setSerial(null);
    setDeviceInfo(null);
    setScannedFiles([]);
    setFilesToRestore([]);
  }

  return (
    <div className="app-root">
      <Sidebar screen={screen} />
      <main className="app-main">
        {screen === SCREENS.HOME && <HomeScreen onSelect={handleTypeSelect} />}

        {screen === SCREENS.PHONE_CONNECT && (
          <PhoneConnectScreen
            mode={recoveryType}
            onBack={() => go(SCREENS.HOME)}
            onConnected={handlePhoneConnected}
            onHome={handleRestart}
          />
        )}

        {screen === SCREENS.PHONE_XHIDE && (
          <XHideFinder
            serial={serial}
            deviceInfo={deviceInfo}
            onBack={() => go(SCREENS.PHONE_CONNECT)}
            onScan={handleXhideScan}
            onHome={handleRestart}
          />
        )}

        {screen === SCREENS.SELECT && (
          <SelectScreen
            recoveryType={recoveryType}
            onBack={() => go(SCREENS.HOME)}
            onScan={handleLocalScan}
            onHome={handleRestart}
          />
        )}

        {screen === SCREENS.SCAN_OPTIONS && (
          <ScanOptionsScreen
            onBack={() => go(serial
              ? (recoveryType === 'xhide' ? SCREENS.PHONE_XHIDE : SCREENS.PHONE_CONNECT)
              : SCREENS.SELECT)}
            onScan={handleScanOptions}
            onHome={handleRestart}
          />
        )}

        {screen === SCREENS.SCANNING && (
          <ScanningScreen
            sourcePath={sourcePath}
            serial={serial}
            selectedTypes={selectedTypes}
            onDone={handleScanDone}
            onHome={handleRestart}
          />
        )}

        {screen === SCREENS.RESULTS && (
          <ResultsScreen
            files={scannedFiles}
            serial={serial}
            onBack={() => go(serial ? (recoveryType === 'xhide' ? SCREENS.PHONE_XHIDE : SCREENS.PHONE_CONNECT) : SCREENS.SELECT)}
            onRestore={handleRestore}
            onHome={handleRestart}
          />
        )}

        {screen === SCREENS.RESTORING && (
          <RestoringScreen
            files={filesToRestore}
            serial={serial}
            onDone={handleRestoreDone}
            onHome={handleRestart}
          />
        )}

        {screen === SCREENS.DONE && (
          <DoneScreen count={restoredCount} onRestart={handleRestart} />
        )}
      </main>
    </div>
  );
}
