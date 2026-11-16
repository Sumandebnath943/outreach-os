"use client";

import { useState } from "react";
import { api, broadcastRefresh } from "@/lib/client";
import { GEO_REGIONS, ROLE_TRACKS } from "@/lib/types";
import { Button, Input, Label, Modal, Select, Textarea, toast } from "../ui";

const EMPTY = {
  first_name: "",
  last_name: "",
  email: "",
  company_name: "",
  job_title: "",
  target_role_opening: "",
  linkedin_url: "",
  company_website: "",
  geo_region: "INDIA",
  role_track: "",
  custom_icebreaker: "",
};

export function AddLeadDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [f, setF] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof EMPTY) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api("/api/leads", { method: "POST", json: f });
      toast(`${f.email} queued for Touch 1`);
      setF(EMPTY);
      broadcastRefresh();
      onClose();
    } catch (err) {
      toast((err as Error).message, "err");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add lead">
      <form onSubmit={submit} className="grid grid-cols-2 gap-3">
        <div>
          <Label>First name</Label>
          <Input value={f.first_name} onChange={set("first_name")} placeholder="Team" />
        </div>
        <div>
          <Label>Last name</Label>
          <Input value={f.last_name} onChange={set("last_name")} />
        </div>
        <div className="col-span-2">
          <Label>Email *</Label>
          <Input type="email" required value={f.email} onChange={set("email")} />
        </div>
        <div>
          <Label>Company *</Label>
          <Input required value={f.company_name} onChange={set("company_name")} />
        </div>
        <div>
          <Label>Their title</Label>
          <Input value={f.job_title} onChange={set("job_title")} placeholder="Head of Talent" />
        </div>
        <div className="col-span-2">
          <Label>Target role opening</Label>
          <Input value={f.target_role_opening} onChange={set("target_role_opening")} placeholder="AI Product Marketing Manager" />
        </div>
        <div>
          <Label>Geo</Label>
          <Select value={f.geo_region} onChange={set("geo_region")}>
            {GEO_REGIONS.map((g) => (
              <option key={g}>{g}</option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Role track</Label>
          <Select value={f.role_track} onChange={set("role_track")}>
            <option value="">Auto-detect</option>
            {ROLE_TRACKS.map((g) => (
              <option key={g}>{g}</option>
            ))}
          </Select>
        </div>
        <div>
          <Label>LinkedIn</Label>
          <Input value={f.linkedin_url} onChange={set("linkedin_url")} />
        </div>
        <div>
          <Label>Website</Label>
          <Input value={f.company_website} onChange={set("company_website")} />
        </div>
        <div className="col-span-2">
          <Label>Custom icebreaker</Label>
          <Textarea rows={2} value={f.custom_icebreaker} onChange={set("custom_icebreaker")} />
        </div>
        <div className="col-span-2 flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={saving}>
            Queue lead
          </Button>
        </div>
      </form>
    </Modal>
  );
}
