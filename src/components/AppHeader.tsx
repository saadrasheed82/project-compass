import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { GraduationCap, LogOut } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";

export const AppHeader = ({ title }: { title: string }) => {
  const { signOut, role, user } = useAuth();
  const navigate = useNavigate();
  const onOut = async () => {
    await signOut();
    navigate("/auth");
  };
  return (
    <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-40">
      <div className="container mx-auto flex items-center justify-between py-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-primary flex items-center justify-center shadow-soft">
            <GraduationCap className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="font-semibold tracking-tight">{title}</h1>
            <p className="text-xs text-muted-foreground">{user?.email}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="secondary" className="capitalize">{role}</Badge>
          <Button variant="ghost" size="sm" onClick={onOut}>
            <LogOut className="w-4 h-4 mr-1" /> Sign out
          </Button>
        </div>
      </div>
    </header>
  );
};
