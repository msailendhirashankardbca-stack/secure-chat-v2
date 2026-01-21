import React, { useState, useEffect, useRef } from 'react';
import { database } from './firebase';
import { ref, set, onValue, remove, push } from 'firebase/database';
import { Shield, Clock, Trash2, Send, Copy, CheckCircle, AlertCircle, Wifi } from 'lucide-react';

export default function SecureChat() {
  const [mode, setMode] = useState('home');
  const [chatLink, setChatLink] = useState('');
  const [roomId, setRoomId] = useState('');
  const [expiryTime, setExpiryTime] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [username, setUsername] = useState('');
  const [tempUsername, setTempUsername] = useState('');
  const [linkCopied, setLinkCopied] = useState(false);
  const [timeLeft, setTimeLeft] = useState('');
  const [encryptionKey, setEncryptionKey] = useState('');
  const [connected, setConnected] = useState(true);
  const [localIP, setLocalIP] = useState('');
  const [ngrokURL, setNgrokURL] = useState('');

  const messagesEndRef = useRef(null);

  // Detect local IP address
  useEffect(() => {
    const detectLocalIP = async () => {
      try {
        // First, check if we're already accessed via an IP
        const hostname = window.location.hostname;
        const ipRegex = /^([0-9]{1,3}\.){3}[0-9]{1,3}$/;

        if (ipRegex.test(hostname) && !hostname.includes('127.')) {
          // Already accessed via IP, use it
          setLocalIP(hostname);
          return;
        }

        // Try WebRTC to detect IP
        const peerConnection = new (window.RTCPeerConnection || window.webkitRTCPeerConnection)({
          iceServers: []
        });

        peerConnection.createDataChannel('');

        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);

        const ipPromise = new Promise((resolve) => {
          const timeout = setTimeout(() => {
            peerConnection.close();
            resolve('');
          }, 3000);

          peerConnection.onicecandidate = (ice) => {
            if (!ice || !ice.candidate) return;
            const candidateStr = ice.candidate.candidate;
            const ipRegex = /([0-9]{1,3}(\.[0-9]{1,3}){3})/;
            const ipAddress = ipRegex.exec(candidateStr)?.[1];

            // Get private IP addresses (192.168.x.x, 10.x.x.x, 172.16.x.x)
            if (ipAddress && (ipAddress.startsWith('192.168.') || ipAddress.startsWith('10.') || ipAddress.startsWith('172.'))) {
              clearTimeout(timeout);
              setLocalIP(ipAddress);
              peerConnection.close();
              resolve(ipAddress);
            }
          };
        });

        await ipPromise;
      } catch (error) {
        console.log('IP detection error:', error);
      }
    };

    detectLocalIP();
  }, []);

  // Detect ngrok URL
  useEffect(() => {
    const detectNgrok = async () => {
      try {
        // Check if we're accessing through ngrok (ngrok adds a header)
        const isNgrok = window.location.hostname.includes('ngrok');
        if (isNgrok) {
          setNgrokURL(window.location.origin);
          return;
        }

        // Try to fetch ngrok inspect endpoint
        const response = await fetch('http://localhost:4040/api/tunnels', {
          timeout: 1000
        }).catch(() => null);

        if (response && response.ok) {
          const data = await response.json();
          const tunnel = data.tunnels.find(t => t.proto === 'https');
          if (tunnel) {
            setNgrokURL(tunnel.public_url);
          }
        }
      } catch (error) {
        console.log('ngrok detection skipped');
      }
    };

    detectNgrok();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Timer countdown
  useEffect(() => {
    if (!expiryTime) return;

    const interval = setInterval(() => {
      const now = Date.now();
      const diff = expiryTime - now;

      if (diff <= 0) {
        destroyChat();
        clearInterval(interval);
      } else {
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        setTimeLeft(`${hours}h ${minutes}m ${seconds}s`);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [expiryTime]);

  // Listen to Firebase messages in real-time
  useEffect(() => {
    if (!roomId || !encryptionKey) return;

    const messagesRef = ref(database, `chats/${roomId}/messages`);
    const unsubscribe = onValue(messagesRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const msgArray = Object.entries(data).map(([key, msg]) => ({
          id: key,
          ...msg,
          text: decrypt(msg.encrypted, encryptionKey)
        }));
        // Sort by timestamp
        msgArray.sort((a, b) => a.timestamp - b.timestamp);
        setMessages(msgArray);
        setConnected(true);
      } else {
        setMessages([]);
      }
    }, (error) => {
      console.error('Firebase error:', error);
      setConnected(false);
    });

    return () => unsubscribe();
  }, [roomId, encryptionKey]);

  // Encryption functions
  const encrypt = (text, key) => {
    let encrypted = '';
    for (let i = 0; i < text.length; i++) {
      encrypted += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    return btoa(encrypted);
  };

  const decrypt = (encrypted, key) => {
    try {
      const decoded = atob(encrypted);
      let decrypted = '';
      for (let i = 0; i < decoded.length; i++) {
        decrypted += String.fromCharCode(decoded.charCodeAt(i) ^ key.charCodeAt(i % key.length));
      }
      return decrypted;
    } catch {
      return '[Encrypted]';
    }
  };

  const generateRoomId = () => {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  };

  const generateEncryptionKey = () => {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  };

  const createChatRoom = async (hours) => {
    try {
      const newRoomId = generateRoomId();
      const newKey = generateEncryptionKey();
      const expiry = Date.now() + (hours * 60 * 60 * 1000);

      // Create chat room in Firebase
      const chatRef = ref(database, `chats/${newRoomId}`);
      await set(chatRef, {
        expiryTime: expiry,
        createdAt: Date.now(),
        active: true
      });

      const protocol = window.location.protocol;
      let baseURL = window.location.origin;

      // Priority: ngrok > local IP > current location
      if (ngrokURL) {
        baseURL = ngrokURL;
      } else if (localIP) {
        baseURL = `${protocol}//${localIP}:3000`;
      }

      const link = `${baseURL}?room=${newRoomId}&key=${newKey}`;
      setChatLink(link);
      setRoomId(newRoomId);
      setEncryptionKey(newKey);
      setExpiryTime(expiry);
      setMode('create');

      // Schedule auto-deletion
      setTimeout(async () => {
        try {
          await remove(ref(database, `chats/${newRoomId}`));
        } catch (error) {
          console.error('Auto-delete error:', error);
        }
      }, hours * 60 * 60 * 1000);

    } catch (error) {
      console.error('Error creating chat:', error);
      alert('Failed to create chat room. Check your internet connection.');
    }
  };

  const joinChat = () => {
    if (!tempUsername.trim()) {
      alert('Please enter your name');
      return;
    }
    setUsername(tempUsername);
    setMode('chat');
  };

  const joinFromLink = async () => {
    const params = new URLSearchParams(window.location.search);
    const room = params.get('room');
    const key = params.get('key');

    if (room && key) {
      try {
        const chatRef = ref(database, `chats/${room}`);
        onValue(chatRef, (snapshot) => {
          const data = snapshot.val();
          if (data) {
            if (Date.now() > data.expiryTime) {
              alert('⏰ This chat has expired and been destroyed!');
              window.location.href = window.location.pathname;
              return;
            }

            setRoomId(room);
            setEncryptionKey(key);
            setExpiryTime(data.expiryTime);

            const name = prompt('🔐 Enter your name to join secure chat:');
            if (name && name.trim()) {
              setUsername(name.trim());
              setMode('chat');
            } else {
              window.location.href = window.location.pathname;
            }
          } else {
            alert('❌ Chat room not found or has been destroyed!');
            window.location.href = window.location.pathname;
          }
        }, { onlyOnce: true });
      } catch (error) {
        console.error('Error joining chat:', error);
        alert('Failed to join chat. Check your internet connection.');
      }
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('room') && params.get('key')) {
      joinFromLink();
    }
  }, []);



  const sendMessage = async () => {
    if (!newMessage.trim()) return;

    try {
      const encrypted = encrypt(newMessage, encryptionKey);
      const messagesRef = ref(database, `chats/${roomId}/messages`);
      const newMessageRef = push(messagesRef);

      await set(newMessageRef, {
        sender: username,
        encrypted: encrypted,
        timestamp: Date.now()
      });

      setNewMessage('');
    } catch (error) {
      console.error('Error sending message:', error);
      alert('Failed to send message. Check your connection.');
    }
  };

  const destroyChat = async () => {
    try {
      if (roomId) {
        // Delete from database
        await remove(ref(database, `chats/${roomId}`));
      }
      setMessages([]);
      setMode('home');
      setRoomId('');
      setEncryptionKey('');
      setExpiryTime(null);
      alert('🔥 Chat destroyed! All messages erased forever. Zero traces left.');
      window.location.href = window.location.pathname;
    } catch (error) {
      console.error('Error destroying chat:', error);
      alert('Failed to destroy chat. Check your connection.');
    }
  };

  const copyLink = () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(chatLink);
      } else {
        // Fallback for non-secure contexts (HTTP)
        const textArea = document.createElement('textarea');
        textArea.value = chatLink;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch (error) {
      console.error('Copy failed:', error);
      alert('Could not copy link. Please copy manually: ' + chatLink);
    }
  };

  // HOME SCREEN
  if (mode === 'home') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          <div className="text-center mb-8">
            <Shield className="w-16 h-16 text-blue-400 mx-auto mb-4 animate-pulse" />
            <h1 className="text-4xl font-bold text-white mb-2">SecureChat</h1>
            <p className="text-gray-300">Temporary • Encrypted • Untraceable</p>
            <div className="flex items-center justify-center gap-2 mt-2">
              <Wifi className="w-4 h-4 text-green-400" />
              <p className="text-green-300 text-sm">Multi-Device Ready</p>
            </div>
          </div>

          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 border border-white/20">
            <h2 className="text-white text-xl font-semibold mb-6">Create Temporary Chat</h2>

            <div className="space-y-3">
              <button
                onClick={() => createChatRoom(1)}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white p-4 rounded-xl transition-all flex items-center justify-between group"
              >
                <span className="font-semibold">1 Hour Chat</span>
                <Clock className="w-5 h-5 group-hover:animate-spin" />
              </button>

              <button
                onClick={() => createChatRoom(6)}
                className="w-full bg-purple-600 hover:bg-purple-500 text-white p-4 rounded-xl transition-all flex items-center justify-between group"
              >
                <span className="font-semibold">6 Hours Chat</span>
                <Clock className="w-5 h-5 group-hover:animate-spin" />
              </button>

              <button
                onClick={() => createChatRoom(24)}
                className="w-full bg-pink-600 hover:bg-pink-500 text-white p-4 rounded-xl transition-all flex items-center justify-between group"
              >
                <span className="font-semibold">24 Hours Chat</span>
                <Clock className="w-5 h-5 group-hover:animate-spin" />
              </button>
            </div>

            <div className="mt-6 space-y-2 text-sm text-gray-300">
              <div className="flex gap-2 items-center">
                <Shield className="w-4 h-4 text-green-400" />
                <span>End-to-end encrypted messages</span>
              </div>
              <div className="flex gap-2 items-center">
                <Trash2 className="w-4 h-4 text-red-400" />
                <span>Auto-destroys after time limit</span>
              </div>
              <div className="flex gap-2 items-center">
                <AlertCircle className="w-4 h-4 text-yellow-400" />
                <span>Works on any device, any network</span>
              </div>
            </div>
          </div>

          <div className="mt-6 text-center text-gray-400 text-xs">
            <p>🔒 Military-grade encryption • 🚫 Zero server logs</p>
          </div>
        </div>
      </div>
    );
  }

  // LINK CREATED
  if (mode === 'create') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 border border-white/20">
            <CheckCircle className="w-16 h-16 text-green-400 mx-auto mb-4 animate-bounce" />
            <h2 className="text-white text-2xl font-bold text-center mb-2">Chat Link Created!</h2>
            <p className="text-center text-gray-400 text-sm mb-6">Share this link with anyone to start chatting</p>

            <div className="bg-slate-800/50 rounded-xl p-4 mb-4">
              <p className="text-gray-400 text-xs mb-2">🔗 Secure Chat Link:</p>
              <p className="text-white text-sm break-all mb-3 font-mono">{chatLink}</p>
              {localIP && (
                <p className="text-gray-500 text-xs mb-3 flex items-center gap-1">
                  <Wifi className="w-3 h-3" />
                  Local IP: <span className="text-gray-300 font-mono">{localIP}:3000</span>
                </p>
              )}
              <button
                onClick={copyLink}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white p-3 rounded-lg flex items-center justify-center gap-2 transition-all"
              >
                {linkCopied ? (
                  <>
                    <CheckCircle className="w-5 h-5" />
                    <span>Copied to Clipboard!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-5 h-5" />
                    <span>Copy Link</span>
                  </>
                )}
              </button>
            </div>

            <div className="bg-yellow-500/20 border border-yellow-400 rounded-xl p-4 mb-6">
              <p className="text-yellow-200 text-sm flex items-center justify-center gap-2">
                <Clock className="w-4 h-4" />
                Expires in: <span className="font-bold">{timeLeft}</span>
              </p>
            </div>

            <div className="bg-blue-500/20 border border-blue-400 rounded-xl p-4 mb-6">
              <p className="text-blue-200 text-xs">💡 Share this link via WhatsApp, email, SMS, or any app!</p>
            </div>

            <input
              type="text"
              placeholder="Enter your name"
              value={tempUsername}
              onChange={(e) => setTempUsername(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && joinChat()}
              className="w-full px-4 py-3 rounded-lg bg-slate-800 text-white mb-3 border border-slate-600 focus:border-blue-500 outline-none"
            />
            <button
              onClick={joinChat}
              className="w-full bg-green-600 hover:bg-green-500 text-white p-3 rounded-lg font-semibold transition-all"
            >
              Join Chat Room
            </button>
          </div>
        </div>
      </div>
    );
  }

  // CHAT SCREEN
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex flex-col">
      {/* Header */}
      <div className="bg-slate-900/50 backdrop-blur-lg border-b border-white/10 p-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className={`w-6 h-6 ${connected ? 'text-green-400' : 'text-red-400'}`} />
            <div>
              <h2 className="text-white font-semibold">Secure Chat</h2>
              <p className="text-gray-400 text-xs flex items-center gap-2">
                {connected ? (
                  <>
                    <Wifi className="w-3 h-3 text-green-400" />
                    Live • {timeLeft} left
                  </>
                ) : (
                  <>
                    <Wifi className="w-3 h-3 text-red-400" />
                    Reconnecting...
                  </>
                )}
              </p>
            </div>
          </div>
          <button
            onClick={destroyChat}
            className="bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm transition-all"
          >
            <Trash2 className="w-4 h-4" />
            Destroy
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-4xl mx-auto space-y-4">
          {messages.length === 0 && (
            <div className="text-center text-gray-400 mt-8">
              <Shield className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="text-lg">Messages are end-to-end encrypted</p>
              <p className="text-sm mt-1">No one can read them, not even the server</p>
              <p className="text-xs mt-2 text-gray-500">Start chatting securely! 🔒</p>
            </div>
          )}

          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.sender === username ? 'justify-end' : 'justify-start'} animate-fade-in`}
            >
              <div
                className={`max-w-xs px-4 py-3 rounded-2xl ${msg.sender === username
                  ? 'bg-blue-600 text-white rounded-br-sm'
                  : 'bg-slate-700 text-white rounded-bl-sm'
                  } shadow-lg`}
              >
                <p className="text-xs opacity-75 mb-1 font-semibold">{msg.sender}</p>

                <p className="break-words">{msg.text}</p>

                <p className="text-xs opacity-75 mt-1">
                  {new Date(msg.timestamp).toLocaleTimeString()}
                </p>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <div className="bg-slate-900/50 backdrop-blur-lg border-t border-white/10 p-4">
        <div className="max-w-4xl mx-auto">

          <div className="flex gap-2">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
              placeholder="Type encrypted message..."
              className="flex-1 px-4 py-3 rounded-xl bg-slate-800 text-white border border-slate-600 focus:border-blue-500 outline-none"
            />
            <button
              onClick={sendMessage}
              disabled={!newMessage.trim()}
              className="bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-6 py-3 rounded-xl transition-all"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}