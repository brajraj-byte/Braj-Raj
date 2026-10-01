import { useState, useEffect, useCallback } from "react";
import { api, apiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Building2, Plus, Mail, Phone, MapPin, User, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

const empty = { organisation_name: "", hr_person: "", hr_email: "", hr_mobile: "", address: "" };

export default function ClientDetails() {
  const [clients, setClients] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [editId, setEditId] = useState(null);

  const load = useCallback(() => { api.get("/clients").then(({ data }) => setClients(data)); }, []);
  useEffect(() => { load(); }, [load]);

  const openNew = () => { setForm(empty); setEditId(null); setOpen(true); };
  const openEdit = (c) => { setForm(c); setEditId(c.id); setOpen(true); };

  const save = async (e) => {
    e.preventDefault();
    try {
      if (editId) await api.put(`/clients/${editId}`, form);
      else await api.post("/clients", form);
      toast.success(editId ? "Client updated" : "Client added");
      setOpen(false); load();
    } catch (ex) { toast.error(apiError(ex)); }
  };

  const remove = async (id) => {
    if (!window.confirm("Delete this client?")) return;
    await api.delete(`/clients/${id}`); toast.success("Client deleted"); load();
  };

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="font-heading text-2xl font-bold text-slate-900">Client Details</h2>
          <p className="text-sm text-slate-500">{clients.length} client organisations</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNew} className="bg-orange-600 hover:bg-orange-700 text-white font-semibold" data-testid="add-client-button">
              <Plus className="h-4 w-4 mr-1.5" /> Add Client
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg" data-testid="client-dialog">
            <DialogHeader><DialogTitle className="font-heading">{editId ? "Edit Client" : "Add Client"}</DialogTitle></DialogHeader>
            <form onSubmit={save} className="space-y-4">
              <div className="space-y-2"><Label>Organisation Name *</Label>
                <Input value={form.organisation_name} onChange={(e) => setForm({ ...form, organisation_name: e.target.value })} required data-testid="client-org-input" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>HR Person</Label><Input value={form.hr_person} onChange={(e) => setForm({ ...form, hr_person: e.target.value })} data-testid="client-hr-input" /></div>
                <div className="space-y-2"><Label>HR Mobile</Label><Input value={form.hr_mobile} onChange={(e) => setForm({ ...form, hr_mobile: e.target.value })} /></div>
              </div>
              <div className="space-y-2"><Label>HR Email</Label><Input type="email" value={form.hr_email} onChange={(e) => setForm({ ...form, hr_email: e.target.value })} /></div>
              <div className="space-y-2"><Label>Address</Label><Textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
              <Button type="submit" className="w-full bg-orange-600 hover:bg-orange-700 text-white font-semibold" data-testid="client-save-button">{editId ? "Update" : "Add"} Client</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {clients.length === 0 ? (
        <div className="text-center py-16 text-slate-400 text-sm">No clients yet. Add your first client organisation.</div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {clients.map((c) => (
            <Card key={c.id} className="p-5 hover:shadow-md transition-shadow" data-testid={`client-card-${c.id}`}>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-11 w-11 rounded-lg bg-orange-50 border border-orange-100 flex items-center justify-center"><Building2 className="h-5 w-5 text-orange-600" /></div>
                  <div><p className="font-heading font-semibold text-slate-900 leading-tight">{c.organisation_name}</p>
                    {c.hr_person && <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5"><User className="h-3 w-3" />{c.hr_person}</p>}</div>
                </div>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(c)} data-testid={`client-edit-${c.id}`}><Pencil className="h-3.5 w-3.5 text-slate-400" /></Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => remove(c.id)} data-testid={`client-delete-${c.id}`}><Trash2 className="h-3.5 w-3.5 text-red-400" /></Button>
                </div>
              </div>
              <div className="mt-4 space-y-1.5 text-sm text-slate-600">
                {c.hr_email && <a href={`mailto:${c.hr_email}`} className="flex items-center gap-2 hover:text-orange-600"><Mail className="h-3.5 w-3.5" />{c.hr_email}</a>}
                {c.hr_mobile && <a href={`tel:${c.hr_mobile}`} className="flex items-center gap-2 hover:text-orange-600"><Phone className="h-3.5 w-3.5" />{c.hr_mobile}</a>}
                {c.address && <p className="flex items-start gap-2 text-slate-500"><MapPin className="h-3.5 w-3.5 mt-0.5" />{c.address}</p>}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
