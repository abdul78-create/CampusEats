"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Camera,
  ShieldCheck,
  RefreshCw,
  Video,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Lock,
} from "lucide-react";
import { httpClient } from "@/lib/api/client";
import { toastSuccess, toastError } from "@/lib/api/errors";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import type { LivenessSession, LivenessChallengeType } from "@/types/api";

type LivenessStep =
  | "EXPLANATION"
  | "CAMERA_REQUEST"
  | "CHALLENGE_READY"
  | "RECORDING"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED"
  | "LOCKED";

interface LivenessVerificationProps {
  onSuccess?: () => void;
}

export function LivenessVerification({ onSuccess }: LivenessVerificationProps) {
  const [step, setStep] = useState<LivenessStep>("EXPLANATION");
  const [session, setSession] = useState<LivenessSession | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [errorReason, setErrorReason] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [countdown, setCountdown] = useState<number>(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Stop camera stream cleanly on unmount or completion
  const stopStream = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
  }, [stream]);

  useEffect(() => {
    return () => {
      stopStream();
    };
  }, [stopStream]);

  // Attach stream to video preview element
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream, step]);

  // STEP 6: Upload Evidence to Backend
  const submitLivenessEvidence = useCallback(
    async (blob: Blob, currentSession: LivenessSession) => {
      setStep("PROCESSING");
      setIsProcessing(true);
      setErrorReason(null);

      try {
        const formData = new FormData();
        formData.append("video", blob, "liveness.webm");
        formData.append("sessionId", currentSession.sessionId);
        formData.append("sessionNonce", currentSession.sessionNonce);
        // NOTE: Zero client-asserted gestures sent, strictly per Phase 7 specification

        const { data } = await httpClient.post<{
          success: boolean;
          data: { isVerified: boolean; decision: string };
        }>("/student/verification/liveness/verify", formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });

        if (data.data.isVerified && data.data.decision === "LIVE") {
          setStep("COMPLETED");
          toastSuccess(
            "Liveness verified",
            "Your temporal anti-spoofing challenge passed successfully."
          );
          stopStream();
          onSuccess?.();
        } else {
          setStep("FAILED");
          setErrorReason(
            "Biometric verification inconclusive or gesture sequence unsatisfied. Please retry in good lighting."
          );
        }
      } catch (err: unknown) {
        const msg =
          err && typeof err === "object" && "response" in err
            ? (err as { response?: { data?: { error?: { message?: string } } } })
                ?.response?.data?.error?.message
            : "Verification failed. Please try again.";

        if (msg?.includes("locked")) {
          setStep("LOCKED");
          setErrorReason(msg);
        } else {
          setStep("FAILED");
          setErrorReason(msg || "Temporal challenge evaluation failed.");
        }
      } finally {
        setIsProcessing(false);
      }
    },
    [stopStream, onSuccess]
  );

  // STEP 2: Request Camera Access
  const requestCamera = async () => {
    setErrorReason(null);
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: "user",
        },
        audio: false,
      });
      setStream(mediaStream);
      setStep("CAMERA_REQUEST");
    } catch {
      setErrorReason(
        "Camera permission was denied or no camera device was detected. Please allow camera access in your browser settings to proceed."
      );
    }
  };

  // STEP 3: Create Server Challenge Session
  const initSession = async () => {
    setIsProcessing(true);
    setErrorReason(null);
    try {
      const { data } = await httpClient.post<{
        success: boolean;
        data: LivenessSession;
      }>("/student/verification/liveness/session");

      setSession(data.data);
      setStep("CHALLENGE_READY");
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { error?: { message?: string } } } })
              ?.response?.data?.error?.message
          : "Failed to initiate liveness session.";

      if (msg?.includes("locked")) {
        setStep("LOCKED");
        setErrorReason(msg);
      } else {
        setErrorReason(msg || "Could not start verification session.");
        toastError(err, "Session initialization failed");
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const finishRecording = useCallback(() => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state === "recording"
    ) {
      mediaRecorderRef.current.stop();
    }
  }, []);

  // STEP 4 & 5: Start Challenge Recording
  const startRecording = () => {
    if (!stream || !session) return;

    chunksRef.current = [];
    let mimeType = "video/webm";
    if (MediaRecorder.isTypeSupported("video/webm;codecs=vp8")) {
      mimeType = "video/webm;codecs=vp8";
    } else if (MediaRecorder.isTypeSupported("video/mp4")) {
      mimeType = "video/mp4";
    }

    try {
      const recorder = new MediaRecorder(stream, { mimeType });
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const finalBlob = new Blob(chunksRef.current, { type: mimeType });
        submitLivenessEvidence(finalBlob, session);
      };

      mediaRecorderRef.current = recorder;
      recorder.start(100); // 100ms slice
      setStep("RECORDING");

      // Duration: calculate total duration needed for sequence
      const challengeCount = session.challengeSequence.length;
      const totalSec = Math.max(challengeCount * 3, 7);
      setCountdown(totalSec);

      const interval = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(interval);
            finishRecording();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch {
      setErrorReason("Video recording failed to start. Please try again.");
    }
  };

  // Render challenge instruction label
  const renderChallengeLabel = (type: LivenessChallengeType) => {
    if (!session) return type;
    switch (type) {
      case "NATURAL_BLINK":
        return `Blink naturally ${session.challengeParams.blinkCount} time${session.challengeParams.blinkCount > 1 ? "s" : ""}`;
      case "HEAD_TURN_LEFT":
        return `Turn head slowly to the LEFT and hold for ${session.challengeParams.leftHoldSec}s`;
      case "HEAD_TURN_RIGHT":
        return `Turn head slowly to the RIGHT and hold for ${session.challengeParams.rightHoldSec}s`;
      default:
        return type;
    }
  };

  return (
    <Card className="w-full max-w-xl mx-auto shadow-[var(--shadow-xl)]">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[var(--accent-subtle)] text-[var(--accent)] flex items-center justify-center">
            <Camera className="w-5 h-5" />
          </div>
          <div>
            <CardTitle className="text-xl">Active Liveness Verification</CardTitle>
            <CardDescription>
              Anti-spoofing temporal challenge to verify human presence
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* STEP 1: Explanation */}
        {step === "EXPLANATION" && (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-[var(--info-bg)] border border-[var(--info)]/20 text-xs text-[var(--info)] space-y-2">
              <div className="font-semibold text-sm flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4" />
                Why is liveness verification required?
              </div>
              <p className="leading-relaxed">
                CampusEats uses certified biometric anti-spoofing to prevent unauthorized account creation, student impersonation, and fraudulent campus food orders.
              </p>
            </div>

            <ul className="space-y-2.5 text-xs text-[var(--text-secondary)]">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-[var(--success)] shrink-0" />
                <span>Ensure your face is well-lit and clearly visible</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-[var(--success)] shrink-0" />
                <span>Remove dark sunglasses or face coverings</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-[var(--success)] shrink-0" />
                <span>Perform the server-issued gestures in sequence</span>
              </li>
            </ul>

            {errorReason && (
              <div className="p-3.5 rounded-xl bg-[var(--danger-bg)] text-xs text-[var(--danger)] flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorReason}</span>
              </div>
            )}

            <Button
              className="w-full"
              size="lg"
              onClick={requestCamera}
              leftIcon={<Camera className="w-4 h-4" />}
            >
              Enable Camera &amp; Continue
            </Button>
          </div>
        )}

        {/* STEP 2: Camera Preview & Session Request */}
        {(step === "CAMERA_REQUEST" || step === "CHALLENGE_READY") && (
          <div className="space-y-5">
            <div className="relative rounded-2xl overflow-hidden bg-black aspect-video border border-[var(--border-subtle)] flex items-center justify-center">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover -scale-x-100"
              />
              <div className="absolute inset-0 border-2 border-dashed border-white/30 rounded-2xl pointer-events-none" />
            </div>

            {step === "CAMERA_REQUEST" && (
              <Button
                className="w-full"
                size="lg"
                loading={isProcessing}
                onClick={initSession}
                rightIcon={<ArrowRight className="w-4 h-4" />}
              >
                Fetch Server Challenge
              </Button>
            )}

            {step === "CHALLENGE_READY" && session && (
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-[var(--bg-base)] border border-[var(--border-subtle)] space-y-2">
                  <div className="text-xs font-semibold uppercase text-[var(--text-secondary)]">
                    Required Gesture Sequence:
                  </div>
                  <ol className="space-y-1.5 text-xs text-[var(--text-primary)]">
                    {session.challengeSequence.map((challenge, idx) => (
                      <li key={idx} className="flex items-center gap-2 font-medium">
                        <span className="w-5 h-5 rounded-full bg-[var(--brand-100)] dark:bg-[var(--brand-900)] text-[var(--brand-800)] dark:text-[var(--brand-200)] flex items-center justify-center text-[10px] font-bold">
                          {idx + 1}
                        </span>
                        <span>{renderChallengeLabel(challenge)}</span>
                      </li>
                    ))}
                  </ol>
                </div>

                <Button
                  className="w-full"
                  size="lg"
                  onClick={startRecording}
                  leftIcon={<Video className="w-4 h-4" />}
                >
                  Start Recording Challenge
                </Button>
              </div>
            )}
          </div>
        )}

        {/* STEP 4 & 5: Live Recording Active */}
        {step === "RECORDING" && session && (
          <div className="space-y-4">
            <div className="relative rounded-2xl overflow-hidden bg-black aspect-video border-2 border-[var(--accent)] flex items-center justify-center">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover -scale-x-100"
              />

              {/* Recording Overlay */}
              <div className="absolute top-3 left-3 flex items-center gap-2 px-3 py-1 rounded-full bg-red-600/90 text-white text-xs font-bold animate-pulse">
                <span className="w-2 h-2 rounded-full bg-white" />
                <span>REC &bull; {countdown}s</span>
              </div>

              {/* Challenge Prompter */}
              <div className="absolute bottom-4 inset-x-4 p-3 rounded-xl bg-black/75 backdrop-blur-md text-white text-center">
                <div className="text-[11px] uppercase tracking-wider text-amber-300 font-semibold mb-0.5">
                  Follow Gestures Sequentially
                </div>
                <div className="text-sm font-bold">
                  {session.challengeSequence.map((c, i) => (
                    <span key={i} className="text-white mx-2">
                      {i + 1}. {renderChallengeLabel(c)}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <Button
              variant="outline"
              className="w-full"
              size="sm"
              onClick={finishRecording}
            >
              Done Early &bull; Submit Evidence
            </Button>
          </div>
        )}

        {/* STEP 6 & 7: Processing */}
        {step === "PROCESSING" && (
          <div className="p-8 text-center space-y-4">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-[var(--accent-subtle)] text-[var(--accent)] animate-spin mb-2">
              <RefreshCw className="w-6 h-6" />
            </div>
            <div className="text-base font-bold text-[var(--text-primary)]">
              Evaluating Anti-Spoofing Challenge
            </div>
            <p className="text-xs text-[var(--text-secondary)] max-w-sm mx-auto leading-relaxed">
              Video evidence is undergoing certified biometric analysis against the server-issued challenge sequence.
            </p>
          </div>
        )}

        {/* STEP 8: Success State */}
        {step === "COMPLETED" && (
          <div className="p-6 text-center space-y-4">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-[var(--success-bg)] text-[var(--success)] mb-2">
              <ShieldCheck className="w-8 h-8" />
            </div>
            <div className="text-xl font-bold text-[var(--text-primary)]">
              Liveness Verification Passed
            </div>
            <div className="p-3.5 rounded-xl bg-[var(--brand-50)] dark:bg-[var(--brand-900)]/40 border border-[var(--brand-200)] text-xs text-[var(--brand-800)] dark:text-[var(--brand-200)] leading-relaxed text-left">
              <strong>Notice:</strong> Liveness verification confirmed human presence. Final account ordering eligibility will be activated once your university identity document is approved by administrative review.
            </div>
          </div>
        )}

        {/* Failure / Retry State */}
        {step === "FAILED" && (
          <div className="p-6 text-center space-y-4">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-[var(--danger-bg)] text-[var(--danger)] mb-2">
              <AlertCircle className="w-8 h-8" />
            </div>
            <div className="text-lg font-bold text-[var(--text-primary)]">
              Verification Unsatisfied
            </div>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              {errorReason || "The challenge gestures were not clearly detected. Please ensure your face is fully lit and repeat the sequence."}
            </p>
            <Button
              className="w-full mt-2"
              size="lg"
              onClick={initSession}
              leftIcon={<RefreshCw className="w-4 h-4" />}
            >
              Start New Challenge Session
            </Button>
          </div>
        )}

        {/* Locked State */}
        {step === "LOCKED" && (
          <div className="p-6 text-center space-y-4">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-[var(--danger-bg)] text-[var(--danger)] mb-2">
              <Lock className="w-8 h-8" />
            </div>
            <div className="text-lg font-bold text-[var(--text-primary)]">
              Verification Locked
            </div>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              Liveness verification has been temporarily locked due to repeated consecutive failures. Please contact university support or wait until the lockout window expires.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
