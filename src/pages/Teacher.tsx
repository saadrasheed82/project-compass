import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Users, Trophy, Megaphone, Copy, CheckCircle2, XCircle, Clock } from "lucide-react";

interface Group {
  id: string;
  name: string;
  capacity: number;
  invite_code: string;
  member_count: number;
  progress: number;
}
interface Proposal {
  id: string;
  group_id: string;
  title: string;
  description: string;
  status: string;
  feedback: string | null;
  group_name?: string;
}

export default function Teacher() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);

  // create group form
  const [gName, setGName] = useState("");
  const [gCap, setGCap] = useState(4);

  // announcement form
  const [aTitle, setATitle] = useState("");
  const [aBody, setABody] = useState("");
  const [aGroup, setAGroup] = useState<string>("");

  const load = async () => {
    setLoading(true);
    const { data: gs } = await supabase.from("groups").select("*").order("created_at");
    const enriched: Group[] = await Promise.all(
      (gs ?? []).map(async (g) => {
        const { count } = await supabase
          .from("group_members").select("*", { count: "exact", head: true }).eq("group_id", g.id);
        const { data: prog } = await supabase.rpc("group_progress", { _group_id: g.id });
        return { ...g, member_count: count ?? 0, progress: Number(prog ?? 0) };
      })
    );
    setGroups(enriched);

    const { data: ps } = await supabase
      .from("project_proposals").select("*, groups(name)").order("created_at", { ascending: false });
    setProposals((ps ?? []).map((p: any) => ({ ...p, group_name: p.groups?.name })));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const createGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("groups").insert({ name: gName, capacity: gCap, created_by: u.user?.id });
    if (error) return toast.error(error.message);
    toast.success("Group created");
    setGName(""); setGCap(4);
    load();
  };

  const reviewProposal = async (id: string, status: "approved" | "rejected", feedback?: string) => {
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("project_proposals")
      .update({ status, feedback: feedback ?? null, reviewed_by: u.user?.id, reviewed_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(`Proposal ${status}`);
    load();
  };

  const sendAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("announcements").insert({
      title: aTitle, body: aBody, group_id: aGroup || null, created_by: u.user!.id,
    });
    if (error) return toast.error(error.message);
    toast.success("Announcement broadcast");
    setATitle(""); setABody(""); setAGroup("");
  };

  const copyInvite = (code: string) => {
    const url = `${window.location.origin}/auth?invite=${code}`;
    navigator.clipboard.writeText(url);
    toast.success("Invite link copied");
  };

  const ranked = [...groups].sort((a, b) => b.progress - a.progress).slice(0, 3);
  const pendingProposals = proposals.filter((p) => p.status === "pending");

  return (
    <div className="min-h-screen bg-background">
      <AppHeader title="Teacher Portal" />
      <main className="container mx-auto py-8 space-y-8">
        {/* Top rankings */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Trophy className="w-5 h-5 text-warning" />
            <h2 className="text-xl font-semibold">Top Rankings</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            {ranked.length === 0 && <p className="text-muted-foreground text-sm col-span-3">No groups yet.</p>}
            {ranked.map((g, i) => (
              <Card key={g.id} className="p-5 bg-gradient-card shadow-soft border-2"
                style={i === 0 ? { borderColor: "hsl(var(--warning))" } : {}}>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-3xl">{["🥇", "🥈", "🥉"][i]}</span>
                  <Badge variant="secondary">{g.member_count}/{g.capacity}</Badge>
                </div>
                <h3 className="font-semibold">{g.name}</h3>
                <div className="mt-3 space-y-1">
                  <div className="flex justify-between text-sm"><span>Progress</span><span className="font-mono">{g.progress}%</span></div>
                  <Progress value={g.progress} />
                </div>
              </Card>
            ))}
          </div>
        </section>

        <Tabs defaultValue="groups">
          <TabsList>
            <TabsTrigger value="groups"><Users className="w-4 h-4 mr-1" /> Groups</TabsTrigger>
            <TabsTrigger value="proposals">
              Proposals {pendingProposals.length > 0 && <Badge className="ml-2 bg-warning text-warning-foreground">{pendingProposals.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="announce"><Megaphone className="w-4 h-4 mr-1" /> Announce</TabsTrigger>
          </TabsList>

          <TabsContent value="groups" className="space-y-4 pt-4">
            <Card className="p-5">
              <form onSubmit={createGroup} className="grid md:grid-cols-[1fr_120px_auto] gap-3 items-end">
                <div>
                  <Label>Group name</Label>
                  <Input value={gName} onChange={(e) => setGName(e.target.value)} placeholder="e.g. Group 1" required />
                </div>
                <div>
                  <Label>Capacity</Label>
                  <Input type="number" min={1} max={20} value={gCap} onChange={(e) => setGCap(parseInt(e.target.value))} required />
                </div>
                <Button type="submit" className="bg-gradient-primary"><Plus className="w-4 h-4 mr-1" />Create</Button>
              </form>
            </Card>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {groups.map((g) => (
                <Card key={g.id} className="p-5">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-semibold">{g.name}</h3>
                    <Badge>{g.member_count}/{g.capacity}</Badge>
                  </div>
                  <div className="space-y-2 mb-3">
                    <div className="flex justify-between text-xs text-muted-foreground"><span>Progress</span><span>{g.progress}%</span></div>
                    <Progress value={g.progress} />
                  </div>
                  <Button variant="outline" size="sm" className="w-full" onClick={() => copyInvite(g.invite_code)}>
                    <Copy className="w-3 h-3 mr-1" /> Copy invite ({g.invite_code})
                  </Button>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="proposals" className="space-y-4 pt-4">
            {proposals.length === 0 && <p className="text-muted-foreground">No proposals submitted yet.</p>}
            {proposals.map((p) => (
              <Card key={p.id} className="p-5">
                <div className="flex justify-between items-start gap-4 mb-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline">{p.group_name}</Badge>
                      <StatusBadge status={p.status} />
                    </div>
                    <h3 className="font-semibold text-lg">{p.title}</h3>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{p.description}</p>
                {p.feedback && (
                  <div className="mt-3 p-3 rounded-lg bg-muted text-sm">
                    <strong>Feedback:</strong> {p.feedback}
                  </div>
                )}
                {p.status === "pending" && (
                  <div className="flex gap-2 mt-4">
                    <Button size="sm" onClick={() => reviewProposal(p.id, "approved")} className="bg-gradient-success">
                      <CheckCircle2 className="w-4 h-4 mr-1" /> Approve
                    </Button>
                    <RejectDialog onReject={(fb) => reviewProposal(p.id, "rejected", fb)} />
                  </div>
                )}
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="announce" className="pt-4">
            <Card className="p-5 max-w-2xl">
              <form onSubmit={sendAnnouncement} className="space-y-4">
                <div>
                  <Label>Title</Label>
                  <Input value={aTitle} onChange={(e) => setATitle(e.target.value)} required />
                </div>
                <div>
                  <Label>Message</Label>
                  <Textarea value={aBody} onChange={(e) => setABody(e.target.value)} required rows={4} />
                </div>
                <div>
                  <Label>Target group (leave blank for everyone)</Label>
                  <select className="w-full h-10 rounded-md border bg-background px-3" value={aGroup} onChange={(e) => setAGroup(e.target.value)}>
                    <option value="">All groups</option>
                    {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                </div>
                <Button type="submit" className="bg-gradient-primary"><Megaphone className="w-4 h-4 mr-1" />Broadcast</Button>
              </form>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

const StatusBadge = ({ status }: { status: string }) => {
  if (status === "approved") return <Badge className="bg-success text-success-foreground"><CheckCircle2 className="w-3 h-3 mr-1" />Approved</Badge>;
  if (status === "rejected") return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Rejected</Badge>;
  return <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
};

const RejectDialog = ({ onReject }: { onReject: (fb: string) => void }) => {
  const [fb, setFb] = useState("");
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="destructive"><XCircle className="w-4 h-4 mr-1" />Reject</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Reject proposal</DialogTitle></DialogHeader>
        <Textarea placeholder="Explain what needs to change..." value={fb} onChange={(e) => setFb(e.target.value)} rows={4} />
        <Button variant="destructive" onClick={() => { onReject(fb); setOpen(false); setFb(""); }}>
          Send rejection
        </Button>
      </DialogContent>
    </Dialog>
  );
};
