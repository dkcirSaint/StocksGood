"use client";

import { useEffect, useState } from "react";
import Modal from "./Modal";
import type { UseWatchlists } from "@/lib/watchlists";

type DialogType = "add" | "remove" | "edit" | null;

export default function WatchlistPanel({
  wl,
  onPickStock,
  embedded = false,
}: {
  wl: UseWatchlists;
  onPickStock: (stockId: string) => void;
  /** 嵌在 Modal 內時隱藏外層標題區塊樣式 */
  embedded?: boolean;
}) {
  const [dialog, setDialog] = useState<DialogType>(null);
  const [nameInput, setNameInput] = useState("");
  const [stocksExpanded, setStocksExpanded] = useState(true);
  const { lists, selectedId, selectedList, selectList } = wl;

  useEffect(() => {
    setStocksExpanded(true);
  }, [selectedId]);

  function openAdd() {
    setNameInput("");
    setDialog("add");
  }
  function openEdit() {
    if (!selectedList) return;
    setNameInput(selectedList.name);
    setDialog("edit");
  }
  function openRemove() {
    if (!selectedList) return;
    setDialog("remove");
  }
  function close() {
    setDialog(null);
  }

  function confirmAdd() {
    const name = nameInput.trim();
    if (!name) return;
    wl.createList(name);
    close();
  }
  function confirmEdit() {
    const name = nameInput.trim();
    if (!name || !selectedId) return;
    wl.renameList(selectedId, name);
    close();
  }
  function confirmRemove() {
    if (!selectedId) return;
    wl.deleteList(selectedId);
    close();
  }

  function handlePickStock(stockId: string) {
    onPickStock(stockId);
    setStocksExpanded(false);
  }

  return (
    <section className={embedded ? "wl-panel wl-panel-embedded" : "section wl-panel"}>
      {!embedded && (
        <h2>
          <span className="dot" />
          追蹤列表
        </h2>
      )}

      <div className="wl-actions">
        <button className="btn" onClick={openAdd}>
          新增
        </button>
        <button className="btn" onClick={openRemove} disabled={!selectedList}>
          移除
        </button>
        <button className="btn" onClick={openEdit} disabled={!selectedList}>
          修改
        </button>
      </div>

      <select
        className="wl-select"
        value={selectedId ?? ""}
        onChange={(e) => selectList(e.target.value)}
        disabled={lists.length === 0}
      >
        {lists.length === 0 && <option value="">（尚無列表）</option>}
        {lists.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}（{l.items.length}）
          </option>
        ))}
      </select>

      <div className="wl-items-collapse">
        {selectedList ? (
          <>
            <button
              type="button"
              className="wl-items-toggle"
              onClick={() => setStocksExpanded((open) => !open)}
              aria-expanded={stocksExpanded}
            >
              <span
                className={`wl-chevron${stocksExpanded ? " open" : ""}`}
                aria-hidden
              />
              股票
              <span className="wl-items-count">{selectedList.items.length}</span>
            </button>

            {stocksExpanded && (
              <div className="wl-items">
                {selectedList.items.length > 0 ? (
                  selectedList.items.map((it) => {
                    return (
                    <div className="wl-item" key={it.stockId}>
                      <button
                        className="wl-item-name"
                        onClick={() => handlePickStock(it.stockId)}
                        title="點擊查詢此股票"
                      >
                        {it.stockName}
                        <span className="wl-item-code">{it.stockId}</span>
                      </button>
                      <button
                        className="wl-item-remove"
                        onClick={() =>
                          wl.removeItem(selectedList.id, it.stockId)
                        }
                        title="從列表移除"
                      >
                        ✕
                      </button>
                    </div>
                    );
                  })
                ) : (
                  <p className="empty">
                    此列表尚無股票。查詢後按「加入列表」即可加入。
                  </p>
                )}
              </div>
            )}
          </>
        ) : (
          <p className="empty">尚無列表，請先按「新增」建立一個。</p>
        )}
      </div>

      {/* 新增列表 */}
      <Modal open={dialog === "add"} title="新增列表" onClose={close}>
        <input
          className="modal-input"
          value={nameInput}
          onChange={(e) => setNameInput(e.target.value)}
          placeholder="請輸入列表名稱"
          autoFocus
          onKeyDown={(e) => e.key === "Enter" && confirmAdd()}
        />
        <div className="modal-footer">
          <button className="btn ghost" onClick={close}>
            取消
          </button>
          <button
            className="btn primary"
            onClick={confirmAdd}
            disabled={!nameInput.trim()}
          >
            確定
          </button>
        </div>
      </Modal>

      {/* 修改列表 */}
      <Modal open={dialog === "edit"} title="修改列表名稱" onClose={close}>
        <input
          className="modal-input"
          value={nameInput}
          onChange={(e) => setNameInput(e.target.value)}
          placeholder="請輸入新的列表名稱"
          autoFocus
          onKeyDown={(e) => e.key === "Enter" && confirmEdit()}
        />
        <div className="modal-footer">
          <button className="btn ghost" onClick={close}>
            返回
          </button>
          <button
            className="btn primary"
            onClick={confirmEdit}
            disabled={!nameInput.trim()}
          >
            確定
          </button>
        </div>
      </Modal>

      {/* 移除列表 */}
      <Modal open={dialog === "remove"} title="刪除列表" onClose={close}>
        <p className="modal-text">
          確定要刪除列表「{selectedList?.name}」嗎？此操作無法復原。
        </p>
        <div className="modal-footer">
          <button className="btn ghost" onClick={close}>
            返回
          </button>
          <button className="btn danger" onClick={confirmRemove}>
            確定
          </button>
        </div>
      </Modal>
    </section>
  );
}
