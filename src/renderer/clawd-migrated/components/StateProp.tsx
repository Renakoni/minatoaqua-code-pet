// @ts-nocheck
import React from "react";
import type { PetState } from "../../shared/events";

interface StatePropProps {
  state: PetState;
}

export function StateProp({ state }: StatePropProps) {
  if (state === "tool_bash") return <div className="state-prop prop-terminal" />;
  if (state === "tool_edit") return <div className="state-prop prop-edit" />;
  if (state === "tool_read") return <div className="state-prop prop-read" />;
  if (state === "tool_search") return <div className="state-prop prop-search" />;
  if (state === "done") return <div className="state-prop prop-done" />;
  if (state === "error") return <div className="state-prop prop-error" />;
  if (state === "thinking") return <div className="state-prop prop-thinking" />;
  return null;
}

