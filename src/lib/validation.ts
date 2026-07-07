// src/lib/validation.ts
import { z } from "zod";

export const ProfileSchema = z.object({
  status: z.enum(["undergrad", "postgrad", "early_career", "other"]),
  region: z.string().min(1).max(100),
  interests: z.array(z.string().min(1).max(50)).min(1).max(8),
  focusAreas: z.string().max(200).default(""),
  emailMode: z.enum(["digest", "per_event"]).default("digest"),
  emailReminders: z.array(z.number().int().min(1).max(30)).default([7, 3, 1]),
  emailNewMatches: z.boolean().default(true),
});

export const SaveSchema = z.object({
  opportunityId: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
});

export const StatusUpdateSchema = z.object({
  opportunityId: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
  status: z.enum(["saved", "researching", "applied", "interview", "rejected", "accepted"]),
});

export const DeleteSavedSchema = z.object({
  opportunityId: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
});

export const SubscribeSchema = z.object({
  email: z.string().email().max(200).transform((e) => e.trim().toLowerCase()),
});

export const UnsubscribeSchema = z.object({
  email: z.string().email().max(200).transform((e) => e.trim().toLowerCase()),
});


export const ReminderFollowSchema = z.object({
  email: z.string().email().max(200).transform((e) => e.trim().toLowerCase()),
  opportunityId: z.string().min(1).max(120).regex(/^[a-z0-9-]+$/),
});
