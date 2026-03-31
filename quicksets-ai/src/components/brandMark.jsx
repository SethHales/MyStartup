import React from "react";

export function BrandMark({ className = "" }) {
  return (
    <div className={`brand-mark ${className}`.trim()} aria-label="QuickSets">
      <span className="brand-badge" aria-hidden="true">
        <img src="/images/icon-v1.svg" alt="" />
      </span>
      <span className="brand-wordmark">
        <span className="brand-wordmark-quick">Quick</span>
        <span className="brand-wordmark-sets">Sets</span>
      </span>
    </div>
  );
}
