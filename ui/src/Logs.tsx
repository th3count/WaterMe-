import { useState, useEffect } from 'react';
import { getApiBaseUrl } from './utils';

interface LogEntry {
  timestamp: string;
  level: string;
  category: string;
  message: string;
  raw: string;
  file?: string;
}

interface LogFile {
  filename: string;
  size: number;
  modified: string;
  size_mb: number;
}

interface LogFilters {
  level: string;
  category: string;
  limit: number;
  search: string;
}

export default function Logs() {
  const [logFiles, setLogFiles] = useState<LogFile[]>([]);
  const [selectedFile, setSelectedFile] = useState('all.log');
  const [logEntries, setLogEntries] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState<LogFilters>({
    level: '',
    category: '',
    limit: 100,
    search: ''
  });
  const [autoRefresh, setAutoRefresh] = useState(false); // Changed from true to false
  const [refreshInterval, setRefreshInterval] = useState(5000); // 5 seconds
  const [scrollPosition, setScrollPosition] = useState(0);

  // Load log files
  const loadLogFiles = async () => {
    try {
      console.log('Loading log files...');
      const response = await fetch(`${getApiBaseUrl()}/api/logs/files`);
      console.log(`Log files response status: ${response.status}`);
      if (response.ok) {
        const data = await response.json();
        console.log('Log files data:', data);
        setLogFiles(data.files);
        // Don't change selectedFile if it's 'all.log' or if the current file exists
        if (selectedFile === 'all.log' || data.files.find((f: LogFile) => f.filename === selectedFile)) {
          return;
        }
        if (data.files.length > 0) {
          setSelectedFile(data.files[0].filename);
        }
      } else {
        const errorText = await response.text();
        console.error(`Log files error: ${errorText}`);
        setError(`Failed to load log files: ${response.status} ${errorText}`);
      }
    } catch (err) {
      setError('Error loading log files');
      console.error('Error loading log files:', err);
    }
  };

  // Load log entries
  const loadLogEntries = async (isRefresh = false) => {
    if (!selectedFile) return;
    
    try {
      if (isRefresh) {
        setRefreshing(true);
        // Save scroll position before refresh
        const logContainer = document.querySelector('.log-entries-container');
        if (logContainer) {
          setScrollPosition(logContainer.scrollTop);
        }
      } else {
        setLoading(true);
      }
      
      const params = new URLSearchParams({
        file: selectedFile,
        limit: filters.limit.toString()
      });
      
      if (filters.level) params.append('level', filters.level);
      if (filters.category) params.append('category', filters.category);
      if (filters.search) params.append('search', filters.search);

      console.log(`Making request to: ${getApiBaseUrl()}/api/logs?${params}`);
      const response = await fetch(`${getApiBaseUrl()}/api/logs?${params}`);
      console.log(`Response status: ${response.status}`);
      if (response.ok) {
        const data = await response.json();
        console.log(`Response data:`, data);
        setLogEntries(data.entries);
        setError('');
        
        // Restore scroll position after refresh
        if (isRefresh) {
          setTimeout(() => {
            const logContainer = document.querySelector('.log-entries-container');
            if (logContainer) {
              logContainer.scrollTop = scrollPosition;
            }
          }, 100);
        }
      } else {
        const errorText = await response.text();
        console.error(`Response error: ${errorText}`);
        setError(`Failed to load log entries: ${response.status} ${errorText}`);
      }
    } catch (err) {
      setError('Error loading log entries');
      console.error('Error loading log entries:', err);
    } finally {
      if (isRefresh) {
        setRefreshing(false);
      } else {
        setLoading(false);
      }
    }
  };

  // Download log file
  const downloadLogFile = async (filename: string) => {
    try {
      if (filename === 'all.log') {
        setError('Cannot download combined logs. Please select a specific log file.');
        return;
      }
      
      const response = await fetch(`${getApiBaseUrl()}/api/logs/download/${filename}`);
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } else {
        setError('Failed to download log file');
      }
    } catch (err) {
      setError('Error downloading log file');
      console.error('Error downloading log file:', err);
    }
  };

  // Clear old logs
  const clearOldLogs = async (days: number = 30) => {
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/logs/clear`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ days })
      });
      
      if (response.ok) {
        const data = await response.json();
        alert(data.message);
        loadLogFiles(); // Refresh file list
      } else {
        setError('Failed to clear old logs');
      }
    } catch (err) {
      setError('Error clearing old logs');
      console.error('Error clearing old logs:', err);
    }
  };

  // Get level color
  const getLevelColor = (level: string) => {
    switch (level.toUpperCase()) {
      case 'DEBUG': return '#6c757d';
      case 'INFO': return '#17a2b8';
      case 'WARN': return '#ffc107';
      case 'WARNING': return '#ffc107';
      case 'ERROR': return '#dc3545';
      case 'CRITICAL': return '#721c24';
      default: return '#6c757d';
    }
  };

  // Get category color
  const getCategoryColor = (category: string) => {
    switch (category.toUpperCase()) {
      case 'SYSTEM': return '#007bff';
      case 'WATERING': return '#28a745';
      case 'PLANTS': return '#fd7e14';
      case 'LOCATIONS': return '#6f42c1';
      case 'HEALTH': return '#e83e8c';
      case 'USER': return '#20c997';
      case 'ERROR': return '#dc3545';
      default: return '#6c757d';
    }
  };

  // Initial load
  useEffect(() => {
    loadLogFiles();
  }, []);

  // Load entries when file or filters change
  useEffect(() => {
    loadLogEntries(false); // Initial load, not refresh
  }, [selectedFile, filters]);

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      loadLogEntries(true); // Auto-refresh
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, selectedFile, filters]);

  return (
    <>
      <style>
        {`
          @keyframes pulse {
            0% { opacity: 1; }
            50% { opacity: 0.6; }
            100% { opacity: 1; }
          }
        `}
      </style>
      <div className="logs-page" style={{ padding: '24px', minWidth: '1200px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0 }}>Logs</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={loadLogFiles}
              style={{
                background: '#00bcd4',
                color: '#181f2a',
                border: 'none',
                borderRadius: '6px',
                padding: '8px 16px',
                fontWeight: 600,
                cursor: 'pointer',
                minWidth: 80,
                marginLeft: 4,
                transition: 'background 0.2s'
              }}
              onMouseOver={e => (e.currentTarget.style.background = '#0097a7')}
              onMouseOut={e => (e.currentTarget.style.background = '#00bcd4')}
            >
              Refresh
            </button>
            <button
              onClick={() => downloadLogFile(selectedFile)}
              style={{
                background: '#28a745',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                padding: '8px 16px',
                fontWeight: 600,
                cursor: 'pointer',
                minWidth: 80,
                marginLeft: 4,
                transition: 'background 0.2s'
              }}
              onMouseOver={e => (e.currentTarget.style.background = '#218838')}
              onMouseOut={e => (e.currentTarget.style.background = '#28a745')}
            >
              Download
            </button>
            <button
              onClick={() => clearOldLogs(30)}
              style={{
                background: '#dc3545',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                padding: '8px 16px',
                fontWeight: 600,
                cursor: 'pointer',
                minWidth: 80,
                marginLeft: 4,
                transition: 'background 0.2s'
              }}
              onMouseOver={e => (e.currentTarget.style.background = '#b52a37')}
              onMouseOut={e => (e.currentTarget.style.background = '#dc3545')}
            >
              Clear
            </button>
          </div>
        </div>
        {/* Log data area below, only this part updates on refresh */}
        <div style={{ minHeight: 400 }}>
          {/* File Selection */}
          <div style={{
            background: '#1a1f2a',
            borderRadius: '8px',
            padding: '20px',
            marginBottom: '16px',
            border: '1px solid #2d3748'
          }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '20px',
              alignItems: 'end'
            }}>
              {/* Refreshing indicator only when actually refreshing */}
              {refreshing && (
                <div style={{
                  background: '#28a745',
                  color: 'white',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  gridColumn: '1 / -1'
                }}>
                  <span style={{ animation: 'pulse 2s infinite' }}>🔄</span>
                  Refreshing...
                </div>
              )}
              <div>
                <label style={{
                  color: '#f4f4f4',
                  fontSize: '14px',
                  fontWeight: 600,
                  marginBottom: '8px',
                  display: 'block'
                }}>
                  Log File:
                </label>
                <select
                  value={selectedFile}
                  onChange={(e) => setSelectedFile(e.target.value)}
                  style={{
                    background: '#2d3748',
                    color: '#f4f4f4',
                    border: '1px solid #4a5568',
                    borderRadius: '4px',
                    padding: '8px 12px',
                    fontSize: '14px',
                    width: '100%',
                    minWidth: '150px'
                  }}
                >
                  <option value="all.log">📋 View All Logs</option>
                  {logFiles.map(file => (
                    <option key={file.filename} value={file.filename}>
                      {file.filename} ({file.size_mb}MB)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{
                  color: '#f4f4f4',
                  fontSize: '14px',
                  fontWeight: 600,
                  marginBottom: '8px',
                  display: 'block'
                }}>
                  Level:
                </label>
                <select
                  value={filters.level}
                  onChange={(e) => setFilters({...filters, level: e.target.value})}
                  style={{
                    background: '#2d3748',
                    color: '#f4f4f4',
                    border: '1px solid #4a5568',
                    borderRadius: '4px',
                    padding: '8px 12px',
                    fontSize: '14px',
                    width: '100%',
                    minWidth: '120px'
                  }}
                >
                  <option value="">All Levels</option>
                  <option value="DEBUG">DEBUG</option>
                  <option value="INFO">INFO</option>
                  <option value="WARN">WARN</option>
                  <option value="ERROR">ERROR</option>
                  <option value="CRITICAL">CRITICAL</option>
                </select>
              </div>

              <div>
                <label style={{
                  color: '#f4f4f4',
                  fontSize: '14px',
                  fontWeight: 600,
                  marginBottom: '8px',
                  display: 'block'
                }}>
                  Category:
                </label>
                <select
                  value={filters.category}
                  onChange={(e) => setFilters({...filters, category: e.target.value})}
                  style={{
                    background: '#2d3748',
                    color: '#f4f4f4',
                    border: '1px solid #4a5568',
                    borderRadius: '4px',
                    padding: '8px 12px',
                    fontSize: '14px',
                    width: '100%',
                    minWidth: '120px'
                  }}
                >
                  <option value="">All Categories</option>
                  <option value="SYSTEM">SYSTEM</option>
                  <option value="WATERING">WATERING</option>
                  <option value="PLANTS">PLANTS</option>
                  <option value="LOCATIONS">LOCATIONS</option>
                  <option value="HEALTH">HEALTH</option>
                  <option value="USER">USER</option>
                  <option value="ERROR">ERROR</option>
                </select>
              </div>

              <div>
                <label style={{
                  color: '#f4f4f4',
                  fontSize: '14px',
                  fontWeight: 600,
                  marginBottom: '8px',
                  display: 'block'
                }}>
                  Limit:
                </label>
                <select
                  value={filters.limit}
                  onChange={(e) => setFilters({...filters, limit: parseInt(e.target.value)})}
                  style={{
                    background: '#2d3748',
                    color: '#f4f4f4',
                    border: '1px solid #4a5568',
                    borderRadius: '4px',
                    padding: '8px 12px',
                    fontSize: '14px',
                    width: '100%',
                    minWidth: '100px'
                  }}
                >
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={200}>200</option>
                  <option value={500}>500</option>
                </select>
              </div>

              <div>
                <label style={{
                  color: '#f4f4f4',
                  fontSize: '14px',
                  fontWeight: 600,
                  marginBottom: '8px',
                  display: 'block'
                }}>
                  Search:
                </label>
                <input
                  type="text"
                  value={filters.search}
                  onChange={(e) => setFilters({...filters, search: e.target.value})}
                  placeholder="Search messages..."
                  style={{
                    background: '#2d3748',
                    color: '#f4f4f4',
                    border: '1px solid #4a5568',
                    borderRadius: '4px',
                    padding: '8px 12px',
                    fontSize: '14px',
                    width: '100%',
                    minWidth: '200px'
                  }}
                />
              </div>
            </div>

            {/* Auto-refresh controls */}
            <div style={{
              display: 'flex',
              gap: '16px',
              alignItems: 'center',
              marginTop: '20px',
              paddingTop: '16px',
              borderTop: '1px solid #2d3748'
            }}>
              <label style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                color: '#f4f4f4',
                cursor: 'pointer',
                fontSize: '14px'
              }}>
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                  style={{ cursor: 'pointer' }}
                />
                Auto-refresh
              </label>

              {autoRefresh && (
                <select
                  value={refreshInterval}
                  onChange={(e) => setRefreshInterval(parseInt(e.target.value))}
                  style={{
                    background: '#2d3748',
                    color: '#f4f4f4',
                    border: '1px solid #4a5568',
                    borderRadius: '4px',
                    padding: '4px 8px',
                    fontSize: '12px'
                  }}
                >
                  <option value={2000}>2s</option>
                  <option value={5000}>5s</option>
                  <option value={10000}>10s</option>
                  <option value={30000}>30s</option>
                </select>
              )}
            </div>
          </div>

          {/* Error Display */}
          {error && (
            <div style={{
              background: '#721c24',
              color: '#f8d7da',
              padding: '12px 16px',
              borderRadius: '6px',
              marginBottom: '16px',
              border: '1px solid #f5c6cb'
            }}>
              {error}
            </div>
          )}

          {/* Log Entries */}
          <div className="log-entries-container" style={{
            maxHeight: '500px',
            overflowY: 'auto',
            background: '#181f2a',
            borderRadius: '8px',
            padding: '12px',
            marginBottom: '24px',
            border: '1px solid #2d3748'
          }}>
            {loading ? (
              <div style={{
                padding: '40px',
                textAlign: 'center',
                color: '#f4f4f4'
              }}>
                Loading logs...
              </div>
            ) : logEntries.length === 0 ? (
              <div style={{
                padding: '40px',
                textAlign: 'center',
                color: '#bdbdbd'
              }}>
                No log entries found
              </div>
            ) : (
              <div 
                className="log-entries-container"
                style={{
                  maxHeight: '600px',
                  overflowY: 'auto',
                  opacity: refreshing ? 0.7 : 1,
                  transition: 'opacity 0.2s ease-in-out'
                }}
              >
                {logEntries.map((entry, index) => (
                  <div
                    key={index}
                    style={{
                      padding: '12px 16px',
                      borderBottom: '1px solid #2d3748',
                      fontFamily: 'monospace',
                      fontSize: '13px',
                      lineHeight: '1.4'
                    }}
                  >
                    <div style={{
                      display: 'flex',
                      gap: '12px',
                      alignItems: 'flex-start',
                      flexWrap: 'wrap'
                    }}>
                      <span style={{
                        color: '#6c757d',
                        minWidth: '150px',
                        flexShrink: 0
                      }}>
                        {entry.timestamp}
                      </span>
                      
                      <span style={{
                        color: getLevelColor(entry.level),
                        fontWeight: 600,
                        minWidth: '80px',
                        flexShrink: 0
                      }}>
                        {entry.level}
                      </span>
                      
                      <span style={{
                        color: getCategoryColor(entry.category),
                        fontWeight: 600,
                        minWidth: '100px',
                        flexShrink: 0
                      }}>
                        {entry.category}
                      </span>
                      
                      <span style={{
                        color: '#f4f4f4',
                        flex: 1,
                        wordBreak: 'break-word'
                      }}>
                        {entry.message}
                        {entry.file && entry.file !== selectedFile && (
                          <span style={{
                            color: '#6c757d',
                            fontSize: '11px',
                            marginLeft: '8px',
                            fontStyle: 'italic'
                          }}>
                            [{entry.file}]
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Log Files Summary */}
          <div style={{
            marginTop: '24px',
            background: '#1a1f2a',
            borderRadius: '8px',
            padding: '20px',
            border: '1px solid #2d3748'
          }}>
            <h3 style={{
              color: '#f4f4f4',
              margin: '0 0 16px 0',
              fontSize: '18px',
              fontWeight: 600
            }}>
              Available Log Files
            </h3>
            
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))',
              gap: '16px'
            }}>
              {logFiles.map(file => (
                <div
                  key={file.filename}
                  style={{
                    background: '#2d3748',
                    padding: '16px',
                    borderRadius: '6px',
                    border: selectedFile === file.filename ? '2px solid #00bcd4' : '1px solid #4a5568',
                    cursor: 'pointer',
                    minWidth: '300px'
                  }}
                  onClick={() => setSelectedFile(file.filename)}
                >
                  <div style={{
                    color: '#f4f4f4',
                    fontWeight: 600,
                    marginBottom: '8px',
                    fontSize: '14px',
                    wordBreak: 'break-word'
                  }}>
                    {file.filename}
                  </div>
                  <div style={{
                    color: '#bdbdbd',
                    fontSize: '12px'
                  }}>
                    Size: {file.size_mb}MB | Modified: {new Date(file.modified).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
} 