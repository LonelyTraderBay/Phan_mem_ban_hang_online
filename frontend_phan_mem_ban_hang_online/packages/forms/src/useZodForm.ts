import { useForm, type FieldValues, type UseFormProps, type UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ZodType } from "zod";

/** Thin wrapper around `useForm` pre-wired with `zodResolver` (ADR-FE-010). */
export function useZodForm<TFieldValues extends FieldValues>(
  schema: ZodType<TFieldValues>,
  options?: Omit<UseFormProps<TFieldValues>, "resolver">,
): UseFormReturn<TFieldValues> {
  return useForm<TFieldValues>({
    ...options,
    resolver: zodResolver(schema),
  });
}
