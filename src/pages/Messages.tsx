import { useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import type { AlumniProfile } from '@/lib/constants';
import Navbar from '@/components/Navbar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Send } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

type Message = {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  is_read: boolean;
  created_at: string;
};

export default function Messages() {
  const { isLoggedIn, isAdmin, currentProfile } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const toId = searchParams.get('to');
  const [conversations, setConversations] = useState<AlumniProfile[]>([]);
  const [activeChat, setActiveChat] = useState<string | null>(toId);
  const [activeChatProfile, setActiveChatProfile] = useState<AlumniProfile | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMsg, setNewMsg] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isLoggedIn || isAdmin || !currentProfile) { navigate('/login'); return; }
    loadConversations();
  }, [isLoggedIn, isAdmin, currentProfile]);

  useEffect(() => {
    if (toId && currentProfile) {
      setActiveChat(toId);
      loadChatProfile(toId);
      loadMessages(toId);
    }
  }, [toId, currentProfile]);

  useEffect(() => {
    if (!currentProfile) return;
    const channel = supabase
      .channel('messages-realtime')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
      }, (payload) => {
        const msg = payload.new as Message;
        if (
          (msg.sender_id === currentProfile.id || msg.receiver_id === currentProfile.id) &&
          (msg.sender_id === activeChat || msg.receiver_id === activeChat)
        ) {
          setMessages(prev => [...prev, msg]);
        }
        loadConversations();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [currentProfile, activeChat]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadConversations = async () => {
    if (!currentProfile) return;
    const { data: msgs } = await supabase
      .from('messages')
      .select('sender_id, receiver_id')
      .or(`sender_id.eq.${currentProfile.id},receiver_id.eq.${currentProfile.id}`);
    if (!msgs) return;
    const ids = new Set<string>();
    msgs.forEach(m => {
      if (m.sender_id !== currentProfile.id) ids.add(m.sender_id);
      if (m.receiver_id !== currentProfile.id) ids.add(m.receiver_id);
    });
    if (toId) ids.add(toId);
    if (ids.size === 0) { setConversations([]); return; }
    const { data: profiles } = await supabase
      .from('alumni_profiles')
      .select('*')
      .in('id', Array.from(ids));
    if (profiles) setConversations(profiles as AlumniProfile[]);
  };

  const loadChatProfile = async (id: string) => {
    const { data } = await supabase.from('alumni_profiles').select('*').eq('id', id).single();
    if (data) setActiveChatProfile(data as AlumniProfile);
  };

  const loadMessages = async (otherId: string) => {
    if (!currentProfile) return;
    const { data } = await supabase
      .from('messages')
      .select('*')
      .or(
        `and(sender_id.eq.${currentProfile.id},receiver_id.eq.${otherId}),and(sender_id.eq.${otherId},receiver_id.eq.${currentProfile.id})`
      )
      .order('created_at');
    if (data) setMessages(data as Message[]);
    // Mark as read
    await supabase.from('messages').update({ is_read: true })
      .eq('receiver_id', currentProfile.id).eq('sender_id', otherId);
  };

  const selectConversation = (id: string) => {
    setActiveChat(id);
    loadChatProfile(id);
    loadMessages(id);
  };

  const sendMessage = async () => {
    if (!newMsg.trim() || !currentProfile || !activeChat) return;
    await supabase.from('messages').insert({
      sender_id: currentProfile.id,
      receiver_id: activeChat,
      content: newMsg.trim(),
    });
    setNewMsg('');
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="max-w-5xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-foreground mb-6">메시지</h1>
        <div className="flex gap-4 h-[600px] border border-border rounded-lg overflow-hidden">
          {/* Conversation list */}
          <div className="w-72 border-r border-border overflow-y-auto flex-shrink-0">
            {conversations.length === 0 && (
              <p className="text-sm text-muted-foreground p-4">대화가 없습니다</p>
            )}
            {conversations.map(c => (
              <button
                key={c.id}
                className={`w-full flex items-center gap-3 p-3 text-left hover:bg-accent transition-colors ${activeChat === c.id ? 'bg-accent' : ''}`}
                onClick={() => selectConversation(c.id)}
              >
                <Avatar className="h-10 w-10">
                  <AvatarImage src={c.photo_url || ''} />
                  <AvatarFallback className="bg-secondary text-secondary-foreground text-sm">{c.full_name?.charAt(0)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{c.full_name}</p>
                  <Badge variant="secondary" className="text-xs">{c.cohort}</Badge>
                </div>
              </button>
            ))}
          </div>

          {/* Chat area */}
          <div className="flex-1 flex flex-col">
            {activeChat && activeChatProfile ? (
              <>
                <div className="p-3 border-b border-border flex items-center gap-3">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={activeChatProfile.photo_url || ''} />
                    <AvatarFallback className="bg-secondary text-xs">{activeChatProfile.full_name?.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <span className="font-semibold text-foreground">{activeChatProfile.full_name}</span>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {messages.map(m => (
                    <div key={m.id} className={`flex ${m.sender_id === currentProfile?.id ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-xs px-3 py-2 rounded-lg text-sm ${
                        m.sender_id === currentProfile?.id
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-secondary text-secondary-foreground'
                      }`}>
                        {m.content}
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
                <div className="p-3 border-t border-border flex gap-2">
                  <Input
                    value={newMsg}
                    onChange={e => setNewMsg(e.target.value)}
                    placeholder="메시지를 입력하세요..."
                    onKeyDown={e => e.key === 'Enter' && sendMessage()}
                  />
                  <Button size="icon" onClick={sendMessage}>
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-muted-foreground">
                대화를 선택하세요
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
