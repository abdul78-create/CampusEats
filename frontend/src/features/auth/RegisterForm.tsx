"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  User,
  GraduationCap,
  Mail,
  Phone,
  Lock,
  UserPlus,
  AlertCircle,
} from "lucide-react";
import { useAuth } from "./useAuth";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/Card";

const registerSchema = z
  .object({
    fullName: z
      .string()
      .min(2, "Full name must be at least 2 characters")
      .max(128, "Full name must not exceed 128 characters"),
    universityRegNumber: z
      .string()
      .min(3, "Registration number must be at least 3 characters")
      .max(64, "Registration number must not exceed 64 characters"),
    email: z.string().email("Please enter a valid university email address"),
    phoneNumber: z
      .string()
      .regex(
        /^\+?[1-9]\d{7,14}$/,
        "Phone number must be a valid E.164 format (e.g. +919876543210)"
      ),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters long")
      .regex(/[a-zA-Z]/, "Password must contain at least one letter")
      .regex(/[0-9]/, "Password must contain at least one number"),
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type RegisterFormData = z.infer<typeof registerSchema>;

export function RegisterForm() {
  const { register: registerAuth } = useAuth();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      fullName: "",
      universityRegNumber: "",
      email: "",
      phoneNumber: "",
      password: "",
      confirmPassword: "",
    },
  });

  const onSubmit = async (data: RegisterFormData) => {
    setServerError(null);
    try {
      await registerAuth({
        fullName: data.fullName,
        universityRegNumber: data.universityRegNumber,
        email: data.email,
        phoneNumber: data.phoneNumber,
        password: data.password,
      });
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { error?: { message?: string } } } })
              ?.response?.data?.error?.message
          : "Registration failed. An account with this email or phone may already exist.";
      setServerError(msg || "Registration failed. Please try again.");
    }
  };

  return (
    <Card className="w-full max-w-lg mx-auto shadow-[var(--shadow-xl)] border-[var(--border-subtle)]">
      <CardHeader className="text-center pb-4">
        <div className="mx-auto w-12 h-12 rounded-2xl bg-[var(--accent-subtle)] text-[var(--accent)] flex items-center justify-center mb-3 shadow-sm">
          <UserPlus className="w-6 h-6" />
        </div>
        <CardTitle className="text-2xl">Create Student Account</CardTitle>
        <CardDescription>
          Register for scheduled campus dining and pre-order pickups
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Full Name"
              placeholder="Alex Johnson"
              leftIcon={<User className="w-4 h-4" />}
              error={errors.fullName?.message}
              {...register("fullName")}
            />

            <Input
              label="University Reg No."
              placeholder="REG-2026-981"
              leftIcon={<GraduationCap className="w-4 h-4" />}
              error={errors.universityRegNumber?.message}
              {...register("universityRegNumber")}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="University Email"
              type="email"
              placeholder="alex@campus.edu"
              leftIcon={<Mail className="w-4 h-4" />}
              error={errors.email?.message}
              {...register("email")}
            />

            <Input
              label="Phone Number"
              placeholder="+919876543210"
              leftIcon={<Phone className="w-4 h-4" />}
              error={errors.phoneNumber?.message}
              {...register("phoneNumber")}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Password"
              type="password"
              placeholder="••••••••"
              leftIcon={<Lock className="w-4 h-4" />}
              error={errors.password?.message}
              helperText="Min 8 chars, 1 letter, 1 number"
              {...register("password")}
            />

            <Input
              label="Confirm Password"
              type="password"
              placeholder="••••••••"
              leftIcon={<Lock className="w-4 h-4" />}
              error={errors.confirmPassword?.message}
              {...register("confirmPassword")}
            />
          </div>

          <Button
            type="submit"
            className="w-full mt-2"
            size="lg"
            loading={isSubmitting}
            rightIcon={<UserPlus className="w-4 h-4" />}
          >
            Create Account &amp; Proceed
          </Button>
        </form>
      </CardContent>

      <CardFooter className="flex justify-center border-t border-[var(--border-subtle)] pt-4 text-xs text-[var(--text-secondary)]">
        <span>Already have an account? </span>
        <Link
          href="/login"
          className="ml-1 text-[var(--accent)] font-semibold hover:underline"
        >
          Sign in
        </Link>
      </CardFooter>
    </Card>
  );
}
