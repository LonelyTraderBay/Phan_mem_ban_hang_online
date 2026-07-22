import { z } from "zod";

/**
 * Common, business-rule-free Zod validators only. Anything tenant/domain-specific (e.g. a
 * particular phone number format, SKU pattern) belongs in the owning feature's own `schemas/`,
 * not here (package description).
 */

export const nonEmptyString = z.string().trim().min(1, "Trường này là bắt buộc.");

export const emailAddress = z.string().trim().email("Email không hợp lệ.");

export const isoDateString = z.string().refine((value) => !Number.isNaN(new Date(value).getTime()), {
  message: "Ngày không hợp lệ.",
});

export const nonNegativeInteger = z.number().int().min(0, "Giá trị phải là số nguyên không âm.");
