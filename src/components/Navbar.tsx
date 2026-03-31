import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Menu, X, MessageSquare } from 'lucide-react';
import { useState } from 'react';

export default function Navbar() {
  const { isLoggedIn, isAdmin, logout } = useAuth();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const links = [
    { to: '/', label: '홈' },
    { to: '/directory', label: '디렉토리' },
    { to: '/network', label: '네트워크 그래프' },
    { to: '/news', label: '뉴스' },
  ];

  if (isLoggedIn && !isAdmin) {
    links.push({ to: '/profile', label: '내 프로필' });
    links.push({ to: '/messages', label: '메시지' });
  }
  if (isAdmin) {
    links.push({ to: '/admin', label: '관리자' });
  }

  const isActive = (path: string) => location.pathname === path;

  return (
    <nav className="border-b border-border bg-background sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">
          <Link to="/" className="text-xl font-bold tracking-tight text-foreground">
            TEU Alumni
          </Link>

          {/* Desktop */}
          <div className="hidden md:flex items-center gap-1">
            {links.map(l => (
              <Link key={l.to} to={l.to}>
                <Button variant={isActive(l.to) ? 'default' : 'ghost'} size="sm">
                  {l.label === '메시지' && <MessageSquare className="h-4 w-4 mr-1" />}
                  {l.label}
                </Button>
              </Link>
            ))}
            {isLoggedIn ? (
              <Button variant="outline" size="sm" onClick={logout}>로그아웃</Button>
            ) : (
              <Link to="/login"><Button variant="outline" size="sm">로그인</Button></Link>
            )}
          </div>

          {/* Mobile toggle */}
          <button className="md:hidden" onClick={() => setMobileOpen(!mobileOpen)}>
            {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden border-t border-border px-4 pb-4 space-y-2 bg-background">
          {links.map(l => (
            <Link key={l.to} to={l.to} onClick={() => setMobileOpen(false)}>
              <Button variant={isActive(l.to) ? 'default' : 'ghost'} className="w-full justify-start" size="sm">
                {l.label}
              </Button>
            </Link>
          ))}
          {isLoggedIn ? (
            <Button variant="outline" className="w-full" size="sm" onClick={() => { logout(); setMobileOpen(false); }}>로그아웃</Button>
          ) : (
            <Link to="/login" onClick={() => setMobileOpen(false)}>
              <Button variant="outline" className="w-full" size="sm">로그인</Button>
            </Link>
          )}
        </div>
      )}
    </nav>
  );
}
