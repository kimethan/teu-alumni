import type { AlumniProfile } from '@/lib/constants';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';

type Props = {
  profile: AlumniProfile;
  onClick?: () => void;
  similarity?: number;
};

export default function AlumniCard({ profile, onClick, similarity }: Props) {
  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow border border-border"
      onClick={onClick}
    >
      <CardContent className="p-4 flex gap-4 items-start">
        <Avatar className="h-16 w-16 flex-shrink-0">
          <AvatarImage src={profile.photo_url || ''} alt={profile.full_name} />
          <AvatarFallback className="bg-accent text-accent-foreground text-lg font-semibold">
            {profile.full_name?.charAt(0) || '?'}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-foreground truncate">{profile.full_name}</h3>
            {profile.nickname && (
              <span className="text-muted-foreground text-sm">({profile.nickname})</span>
            )}
            {similarity !== undefined && (
              <Badge variant="outline" className="ml-auto text-xs">
                {Math.round(similarity * 100)}% 일치
              </Badge>
            )}
          </div>
          <Badge variant="secondary" className="mt-1 text-xs">{profile.cohort}</Badge>
          {(profile.company || profile.title) && (
            <p className="text-sm text-muted-foreground mt-1 truncate">
              {profile.title}{profile.title && profile.company ? ' · ' : ''}{profile.company}
            </p>
          )}
          {profile.interests && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{profile.interests}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
