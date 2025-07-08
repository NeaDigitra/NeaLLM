import React, { useState, useEffect, useRef } from 'react'
import { Send, Settings, Zap, User, Bot, Loader2, AlertCircle, CheckCircle, Copy, RefreshCw, Shield, Code } from 'lucide-react'
import ReactMarkdown from 'react-markdown'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

interface ProviderSettings {
  provider: 'ollama' | 'lmstudio'
  baseUrl: string
  model: string
}

interface ModelInfo {
  name: string
  size?: string
  modified_at?: string
}

const defaultSettings: ProviderSettings = {
  provider: 'ollama',
  baseUrl: 'http://localhost:11434',
  model: 'llama2'
}

declare global {
  interface Window {
    acquireVsCodeApi: () => {
      postMessage: (message: any) => void
      setState: (state: any) => void
      getState: () => any
    }
  }
}

const App: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([])
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [settings, setSettings] = useState<ProviderSettings>(defaultSettings)
  const [showSettings, setShowSettings] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'connecting'>('disconnected')
  const [availableModels, setAvailableModels] = useState<ModelInfo[]>([])
  const [isLoadingModels, setIsLoadingModels] = useState(false)
  const [vscode] = useState(() => {
    if (typeof window !== 'undefined' && window.acquireVsCodeApi) {
      return window.acquireVsCodeApi()
    }
    return null
  })
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (vscode) {
      const savedState = vscode.getState()
      if (savedState) {
        setMessages(savedState.messages || [])
        setSettings(savedState.settings || defaultSettings)
      }
    }
    testConnection()
  }, [])

  useEffect(() => {
    if (connectionStatus === 'connected' && availableModels.length === 0) {
      loadAvailableModels()
    }
  }, [settings.provider, connectionStatus, availableModels.length])

  useEffect(() => {
    if (vscode) {
      vscode.setState({
        messages,
        settings
      })
    }
  }, [messages, settings, vscode])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto'
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 120)}px`
    }
  }, [inputValue])

  const loadAvailableModels = async () => {
    setIsLoadingModels(true)
    try {
      let response: Response
      if (settings.provider === 'ollama') {
        response = await fetch(`${settings.baseUrl}/api/tags`, {
          method: 'GET',
          signal: AbortSignal.timeout(5000)
        })
      } else {
        response = await fetch(`${settings.baseUrl}/v1/models`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          mode: 'cors',
          signal: AbortSignal.timeout(5000)
        })
      }
      if (response.ok) {
        const data = await response.json()
        let models: ModelInfo[] = []
        if (settings.provider === 'ollama') {
          models = data.models?.map((model: any) => ({
            name: model.name,
            size: model.size,
            modified_at: model.modified_at
          })) || []
        } else {
          if (data.data && Array.isArray(data.data)) {
            models = data.data.map((model: any) => {
              return {
                name: model.id || model.name || 'Unknown Model',
                size: model.object || model.owned_by || 'model'
              }
            })
          } else if (Array.isArray(data)) {
            models = data.map((model: any) => ({
              name: model.id || model.name || 'Unknown Model',
              size: model.object || model.owned_by || 'model'
            }))
          } else {
            models = []
          }
        }
        setAvailableModels(models)
        if (models.length > 0 && !models.find(m => m.name === settings.model)) {
          setSettings(prev => ({ ...prev, model: models[0].name }))
        }
      }
    } catch (error) {
      setAvailableModels([])
    } finally {
      setIsLoadingModels(false)
    }
  }

  const testConnection = async () => {
    setConnectionStatus('connecting')
    try {
      let response: Response
      if (settings.provider === 'ollama') {
        response = await fetch(`${settings.baseUrl}/api/tags`, {
          method: 'GET',
          signal: AbortSignal.timeout(5000)
        })
      } else {
        response = await fetch(`${settings.baseUrl}/v1/models`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          mode: 'cors',
          signal: AbortSignal.timeout(5000)
        })
      }
      if (response.ok) {
        setConnectionStatus('connected')
      } else {
        setConnectionStatus('disconnected')
      }
    } catch (error) {
      setConnectionStatus('disconnected')
    }
  }

  const sendMessage = async () => {
    if (!(inputValue.trim()) || isLoading) return
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: inputValue.trim(),
      timestamp: Date.now()
    }
    setMessages(prev => [...prev, userMessage])
    setInputValue('')
    setIsLoading(true)
    setTimeout(() => inputRef.current?.focus(), 100)
    try {
      let response: Response
      if (settings.provider === 'ollama') {
        response = await fetch(`${settings.baseUrl}/api/generate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: settings.model,
            prompt: userMessage.content,
            stream: false
          })
        })
      } else {
        response = await fetch(`${settings.baseUrl}/v1/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          mode: 'cors',
          body: JSON.stringify({
            model: settings.model,
            messages: [
              { role: 'user', content: userMessage.content }
            ],
            stream: false
          })
        })
      }
      if (!(response.ok)) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      const data = await response.json()
      let assistantContent = ''
      if (settings.provider === 'ollama') {
        assistantContent = data.response || 'No response received'
      } else {
        assistantContent = data.choices?.[0]?.message?.content || 'No response received'
      }
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: assistantContent,
        timestamp: Date.now()
      }
      setMessages(prev => [...prev, assistantMessage])
      setConnectionStatus('connected')
    } catch (error) {
      setConnectionStatus('disconnected')
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `❌ **Error**: ${error instanceof Error ? error.message : 'Unknown error occurred'}`,
        timestamp: Date.now()
      }
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const updateSettings = (newSettings: Partial<ProviderSettings>) => {
    setSettings(prev => ({ ...prev, ...newSettings }))
    setAvailableModels([])
    if (newSettings.provider || newSettings.baseUrl) {
      setTimeout(() => {
        testConnection()
      }, 100)
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  const clearChat = () => {
    setMessages([])
  }

  const getStatusIcon = () => {
    switch (connectionStatus) {
      case 'connected':
        return <CheckCircle size={14} />
      case 'connecting':
        return <Loader2 size={14} className="animate-spin" />
      case 'disconnected':
      default:
        return <AlertCircle size={14} />
    }
  }

  const getStatusText = () => {
    switch (connectionStatus) {
      case 'connected':
        return 'Connected'
      case 'connecting':
        return 'Connecting...'
      case 'disconnected':
      default:
        return 'Disconnected'
    }
  }

  return (
    <div className="app">
      <div className="app-header">
        <div className="header-left">
          <div className="app-title">
            <div className="app-icon">
              <Zap size={20} />
            </div>
            <h1>NeaLLM</h1>
          </div>
          <div className={`connection-status ${connectionStatus}`}>
            {getStatusIcon()}
            <span className="status-text">{getStatusText()}</span>
          </div>
        </div>
        <div className="header-actions">
          <a
            href="https://github.com/NeaDigitra/NeaLLM"
            className="icon-button"
            target="_blank"
            rel="noopener noreferrer"
            title="GitHub Repository"
            style={{ marginRight: 8 }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2C6.477 2 2 6.484 2 12.021c0 4.428 2.865 8.184 6.839 9.504.5.092.682-.217.682-.482 0-.237-.009-.868-.014-1.703-2.782.605-3.369-1.342-3.369-1.342-.454-1.155-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.004.07 1.532 1.032 1.532 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.339-2.221-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.987 1.029-2.686-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.025A9.564 9.564 0 0 1 12 6.844c.85.004 1.705.115 2.504.337 1.909-1.295 2.748-1.025 2.748-1.025.546 1.378.202 2.397.1 2.65.64.699 1.028 1.593 1.028 2.686 0 3.847-2.337 4.695-4.566 4.944.359.309.678.919.678 1.852 0 1.336-.012 2.417-.012 2.747 0 .267.18.577.688.479C19.138 20.2 22 16.447 22 12.021 22 6.484 17.523 2 12 2z"></path></svg>
          </a>
          <button 
            className="icon-button" 
            onClick={() => testConnection()}
            title="Test Connection"
          >
            <RefreshCw size={16} />
          </button>
          <button 
            className="icon-button" 
            onClick={clearChat}
            title="Clear Chat"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c0 1 1 2 2 2v2"/>
            </svg>
          </button>
          <button 
            className={`icon-button ${showSettings ? 'active' : ''}`}
            onClick={() => setShowSettings(!showSettings)}
            title="Settings"
          >
            <Settings size={16} />
          </button>
        </div>
      </div>

      {showSettings && (
        <div className="settings-panel">
          <div className="settings-container">
            <div className="settings-section">
              <h3>AI Provider</h3>
              <div className="form-group">
                <label>Provider Type</label>
                <select
                  value={settings.provider}
                  onChange={(e) => updateSettings({ 
                    provider: e.target.value as 'ollama' | 'lmstudio',
                    baseUrl: e.target.value === 'ollama' ? 'http://localhost:11434' : 'http://localhost:1234'
                  })}
                >
                  <option value="ollama">Ollama</option>
                  <option value="lmstudio">LM Studio</option>
                </select>
              </div>
              <div className="form-group">
                <label>Base URL</label>
                <input
                  type="text"
                  value={settings.baseUrl}
                  onChange={(e) => updateSettings({ baseUrl: e.target.value })}
                  placeholder="http://localhost:11434"
                />
              </div>
              <div className="form-group">
                <label>Model Name</label>
                <div className="model-input-group">
                  {
                    availableModels.length > 0 ? (
                      <select
                        value={settings.model}
                        onChange={(e) => updateSettings({ model: e.target.value })}
                      >
                        {
                          availableModels.map((model) => {
                            return (
                              <option key={model.name} value={model.name}>
                                {model.name}
                              </option>
                            )
                          })
                        }
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={settings.model}
                        onChange={(e) => updateSettings({ model: e.target.value })}
                        placeholder="llama2"
                      />
                    )
                  }
                  <button
                    type="button"
                    className="refresh-models-btn"
                    onClick={() => {
                      setAvailableModels([])
                      loadAvailableModels()
                    }}
                    disabled={isLoadingModels}
                    title="Refresh models"
                  >
                    {isLoadingModels ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <RefreshCw size={14} />
                    )}
                  </button>
                  </div>
                  {
                    availableModels.length > 0 && (
                      <div className="model-info">
                        <span>{availableModels.length} model{availableModels.length !== 1 ? 's' : ''} available</span>
                      </div>
                    )
                  }
              </div>
            </div>
            <div className="settings-info">
              <p>Make sure your {settings.provider} server is running on {settings.baseUrl}</p>
            </div>
          </div>
        </div>
      )}
      <div className="chat-area">
        <div className="messages-container">
          {
            messages.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">
                  <Bot size={48} />
                </div>
                <h2>Welcome to NeaLLM</h2>
                <p>Chat with local LLMs. Ollama & LM Studio supported.</p>
                <div className="feature-grid">
                  <div className="feature-card">
                    <div className="feature-card-icon">
                      <Zap size={24} />
                    </div>
                    <div className="feature-card-content">
                      <h4>Lightning Fast</h4>
                      <p>Instant local responses, no cloud, always super fast.</p>
                    </div>
                  </div>
                  <div className="feature-card">
                    <div className="feature-card-icon">
                      <Shield size={24} />
                    </div>
                    <div className="feature-card-content">
                      <h4>100% Private</h4>
                      <p>All data stays local, never leaves your device, truly private.</p>
                    </div>
                  </div>
                  <div className="feature-card">
                    <div className="feature-card-icon">
                      <Code size={24} />
                    </div>
                    <div className="feature-card-content">
                      <h4>Smart Assistant</h4>
                      <p>Ollama and LM Studio LLMs, seamless provider switching.</p>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <>
                {
                  messages.map((message) => (
                    <div key={message.id} className={`message-wrapper ${message.role}`}>
                      <div className="message-avatar">
                        {message.role === 'user' ? <User size={16} /> : <Bot size={16} />}
                      </div>
                      <div className="message-bubble">
                        <div className="message-content">
                          {
                            message.role === 'assistant' ? (
                              <ReactMarkdown components={{p: props => <p style={{whiteSpace: 'pre-line'}}>{props.children}</p>}}>{message.content}</ReactMarkdown>
                            ) : (
                              <p style={{whiteSpace: 'pre-line'}}>{message.content}</p>
                            )
                          }
                        </div>
                        <div className="message-meta">
                          <span className="message-time">
                            {
                              new Date(message.timestamp).toLocaleTimeString([], { 
                                hour: '2-digit', 
                                minute: '2-digit' 
                              })
                            }
                          </span>
                          <button 
                            className="copy-button"
                            onClick={() => copyToClipboard(message.content)}
                            title="Copy"
                          >
                            <Copy size={12} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                }
                {
                  isLoading && (
                    <div className="message-wrapper assistant">
                      <div className="message-avatar">
                        <Bot size={16} />
                      </div>
                      <div className="message-bubble">
                        <div className="typing-animation">
                          <div className="typing-dots">
                            <span></span>
                            <span></span>
                            <span></span>
                          </div>
                          <span className="typing-text">Thinking...</span>
                        </div>
                      </div>
                    </div>
                  )
                }
                <div ref={messagesEndRef} />
              </>
            )
          }
        </div>

        <div className="input-area">
          {connectionStatus === 'disconnected' && (
            <div className="connection-alert">
              <AlertCircle size={14} />
              <span>Unable to connect to {settings.provider}. Please check your settings.</span>
            </div>
          )}
          <div className="input-container">
            <textarea
              ref={inputRef}
              className="message-input"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Type your question or code request here..."
              disabled={isLoading}
              rows={1}
            />
            <button
              className={`send-button ${isLoading || !inputValue.trim() ? 'disabled' : ''}`}
              onClick={sendMessage}
              disabled={isLoading || !inputValue.trim()}
            >
              {
                isLoading ? (
                <Loader2 size={18} className="animate-spin" />
                ) : (
                  <Send size={18} />
                )
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App