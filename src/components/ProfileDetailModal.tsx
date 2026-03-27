import type { AlumniProfile } from '@/lib/constants';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth';
import { useNavigate } from 'react-router-dom';
import { MessageSquare, Mail, Globe } from 'lucide-react';

type Props = {
  profile: AlumniProfile | null;
  open: boolean;
  onClose: () => void;
};

export default function ProfileDetailModal({ profile, open, onClose }: Props) {
  const { isLoggedIn, isAdmin } = useAuth();
  const navigate = useNavigate();

  if (!profile) return null;

  const handleDM = () => {
    onClose();
    navigate(`/messages?to=${profile.id}`);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="sr-only">프로필 상세</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4">
          <Avatar className="h-24 w-24">
            <AvatarImage src={profile.photo_url || ''} alt={profile.full_name} />
            <AvatarFallback className="bg-accent text-accent-foreground text-2xl font-bold">
              {profile.full_name?.charAt(0) || '?'}
            </AvatarFallback>
          </Avatar>
          <div className="text-center">
            <h2 className="text-xl font-bold text-foreground">{profile.full_name}</h2>
            {profile.nickname && <p className="text-muted-foreground">({profile.nickname})</p>}
            <Badge variant="secondary" className="mt-2">{profile.cohort}</Badge>
          </div>
        </div>

        <div className="space-y-4 mt-4">
          {(profile.company || profile.title) && (
            <div>
              <h4 className="text-sm font-semibold text-foreground mb-1">직장 / 직함</h4>
              <p className="text-sm text-muted-foreground">{profile.title}{profile.title && profile.company ? ' · ' : ''}{profile.company}</p>
            </div>
          )}
          {profile.interests && (
            <div>
              <h4 className="text-sm font-semibold text-foreground mb-1">관심사</h4>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{profile.interests}</p>
            </div>
          )}
          {profile.contribute && (
            <div>
              <h4 className="text-sm font-semibold text-foreground mb-1">커뮤니티에 기여할 수 있는 것</h4>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{profile.contribute}</p>
            </div>
          )}
          {profile.gain && (
            <div>
              <h4 className="text-sm font-semibold text-foreground mb-1">커뮤니티에서 얻고 싶은 것</h4>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{profile.gain}</p>
            </div>
          )}
          {profile.email && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Mail className="h-4 w-4" /> {profile.email}
            </div>
          )}
          {profile.sns && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Globe className="h-4 w-4" /> {profile.sns}
            </div>
          )}
        </div>

        {isLoggedIn && !isAdmin && (
          <Button className="w-full mt-4" onClick={handleDM}>
            <MessageSquare className="h-4 w-4 mr-2" /> DM 보내기
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
