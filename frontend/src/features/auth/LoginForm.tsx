"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Mail, Lock, LogIn, AlertCircle } from "lucide-react";
import { useAuth } from "./useAuth";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/Card";

const loginSchema = z.object({
  identifier: z
    .string()
    .min(3, "Identifier must be at least 3 characters (email or reg number)"),
  password: z.string().min(1, "Password is required"),
});

type LoginFormData = z.infer<typeof loginSchema>;

export function LoginForm() {
  const { login } = useAuth();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      identifier: "",
      password: "",
    },
  });

  const onSubmit = async (data: LoginFormData) => {
    setServerError(null);
    try {
      await login(data.identifier, data.password);
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { error?: { message?: string } } } })
              ?.response?.data?.error?.message
          : "Sign-in failed. Please verify your email and password.";
      setServerError(msg || "Sign-in failed. Please check your credentials.");
    }
  };

  return (
    <Card className="w-full max-w-md mx-auto shadow-[var(--shadow-xl)] border-[var(--border-subtle)]">
      <CardHeader className="text-center pb-4">
        <div className="mx-auto w-12 h-12 rounded-2xl bg-[var(--accent-subtle)] text-[var(--accent)] flex items-center justify-center mb-3 shadow-sm">
          <LogIn className="w-6 h-6" />
        </div>
        <CardTitle className="text-2xl">Welcome Back</CardTitle>
        <CardDescription>
          Sign in to your CampusEats account to order or manage dining
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {serverError && (
            <div
              className="p-3.5 rounded-xl bg-[var(--danger-bg)] border border-[var(--danger)]/20 text-xs text-[var(--danger)] flex items-center gap-2"
              role="alert"
            >
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{serverError}</span>
            </div>
          )}

          <Input
            label="Email or Reg Number"
            placeholder="student@university.edu"
            leftIcon={<Mail className="w-4 h-4" />}
            error={errors.identifier?.message}
            {...register("identifier")}
          />

          <Input
            label="Password"
            type="password"
            placeholder="••••••••"
            leftIcon={<Lock className="w-4 h-4" />}
            error={errors.password?.message}
            {...register("password")}
          />

          <Button
            type="submit"
            className="w-full mt-2"
            size="lg"
            loading={isSubmitting}
            rightIcon={<LogIn className="w-4 h-4" />}
          >
            Sign In
          </Button>
        </form>
      </CardContent>

      <CardFooter className="flex justify-center border-t border-[var(--border-subtle)] pt-4 text-xs text-[var(--text-secondary)]">
        <span>Don&apos;t have an account? </span>
        <Link
          href="/register"
          className="ml-1 text-[var(--accent)] font-semibold hover:underline"
        >
          Create account
        </Link>
      </CardFooter>
    </Card>
  );
}
