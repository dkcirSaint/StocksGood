"use client";

import Modal from "./Modal";
import WatchlistPanel from "./WatchlistPanel";
import type { UseWatchlists } from "@/lib/watchlists";

export default function WatchlistSettings({
  open,
  onClose,
  wl,
  onPickStock,
}: {
  open: boolean;
  onClose: () => void;
  wl: UseWatchlists;
  onPickStock: (stockId: string) => void;
}) {
  return (
    <Modal open={open} title="追蹤列表" onClose={onClose}>
      <div className="wl-modal-body">
        <WatchlistPanel
          wl={wl}
          embedded
          onPickStock={(stockId) => {
            onPickStock(stockId);
            onClose();
          }}
        />
      </div>
    </Modal>
  );
}
