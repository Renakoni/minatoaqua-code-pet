// @ts-nocheck
import React from "react";

interface ToolStream {
  id: string;
  tool: string;
  detail?: string;
  startTime: number;
}

interface ToolStreamsProps {
  streams: ToolStream[];
  offset?: { x: number; y: number };
}

export function ToolStreams({ streams, offset }: ToolStreamsProps) {
  return (
    <div className="tool-streams" style={offset ? { transform: `translate(${offset.x}px, ${offset.y}px)` } : undefined}>
      {streams.map(s => (
        <div key={s.id} className="tool-stream-item">
          <span className="tool-stream-icon" />
          <span className="tool-stream-name">{s.tool}</span>
          {s.detail && <span className="tool-stream-detail">{s.detail}</span>}
        </div>
      ))}
    </div>
  );
}

