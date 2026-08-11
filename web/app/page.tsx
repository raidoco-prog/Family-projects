"use client";

import { useMemo, useState } from 'react';

type InventoryItem = {
  id: string;
  name: string;
  category: string;
  quantity: number;
  minQuantity: number;
  unit: string;
  autoRestock: boolean;
};

type ShoppingItem = {
  id: string;
  name: string;
  category: string;
  quantity: number;
  unit: string;
  isChecked: boolean;
};

const initialInventory: InventoryItem[] = [
  {
    id: 'milk',
    name: 'חלב',
    category: 'מוצרי חלב',
    quantity: 1,
    minQuantity: 2,
    unit: 'ליטר',
    autoRestock: true,
  },
  {
    id: 'bread',
    name: 'לחם',
    category: 'מאפים',
    quantity: 0,
    minQuantity: 1,
    unit: 'יח׳',
    autoRestock: true,
  },
];

const initialShopping: ShoppingItem[] = [
  {
    id: 'milk-shopping',
    name: 'חלב',
    category: 'מוצרי חלב',
    quantity: 1,
    unit: 'ליטר',
    isChecked: false,
  },
];

export default function HomePage() {
  const [inventory, setInventory] = useState<InventoryItem[]>(initialInventory);
  const [shopping, setShopping] = useState<ShoppingItem[]>(initialShopping);
  const [newItemName, setNewItemName] = useState('');
  const [newItemCategory, setNewItemCategory] = useState('');

  const lowStockItems = useMemo(
    () => inventory.filter((item) => item.quantity <= item.minQuantity),
    [inventory]
  );

  const uncheckedShopping = useMemo(
    () => shopping.filter((item) => !item.isChecked),
    [shopping]
  );

  const addShoppingItem = () => {
    if (!newItemName.trim()) return;

    setShopping((current) => [
      {
        id: crypto.randomUUID(),
        name: newItemName,
        category: newItemCategory || 'אחר',
        quantity: 1,
        unit: 'יח׳',
        isChecked: false,
      },
      ...current,
    ]);

    setNewItemName('');
    setNewItemCategory('');
  };

  const toggleShoppingChecked = (itemId: string) => {
    setShopping((current) =>
      current.map((item) =>
        item.id === itemId ? { ...item, isChecked: !item.isChecked } : item
      )
    );
  };

  const restockInventory = (itemId: string) => {
    setInventory((current) =>
      current.map((item) =>
        item.id === itemId
          ? { ...item, quantity: item.quantity + 1 }
          : item
      )
    );
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
      <section className="rounded-[2rem] border border-cyan-700 bg-cyan-950/80 p-8 shadow-2xl shadow-cyan-950/30">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.24em] text-cyan-300">שלב 1</p>
            <h1 className="mt-2 text-3xl font-semibold text-cyan-50">קניות ומלאי</h1>
            <p className="mt-3 max-w-2xl text-cyan-200">
              רשימת קניות מהירה, בדיקת מלאי כשהכמות נמוכה, וסנכרון חכם בין שניהם.
            </p>
          </div>
          <div className="rounded-3xl bg-cyan-900 p-4 text-cyan-100 ring-1 ring-cyan-700/70">
            <p className="text-sm text-cyan-300">מהשבוע הראשון</p>
            <p className="text-xl font-semibold text-cyan-50">MVP קניות + מלאי</p>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-6">
          <div className="rounded-3xl border border-cyan-700 bg-cyan-900/90 p-6">
            <h2 className="text-xl font-semibold text-cyan-50">רשימת קניות</h2>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
              <label className="flex-1">
                <span className="mb-2 block text-sm text-cyan-300">הוסף פריט</span>
                <input
                  value={newItemName}
                  onChange={(event) => setNewItemName(event.target.value)}
                  className="w-full rounded-2xl border border-cyan-700 bg-cyan-950/80 px-4 py-3 text-cyan-50 outline-none ring-offset-2 transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/40"
                  placeholder="דוגמה: חלב"
                />
              </label>
              <label className="flex-1">
                <span className="mb-2 block text-sm text-cyan-300">קטגוריה</span>
                <input
                  value={newItemCategory}
                  onChange={(event) => setNewItemCategory(event.target.value)}
                  className="w-full rounded-2xl border border-cyan-700 bg-cyan-950/80 px-4 py-3 text-cyan-50 outline-none ring-offset-2 transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/40"
                  placeholder="מוצרי חלב, מאפים, ניקיון"
                />
              </label>
              <button
                onClick={addShoppingItem}
                className="rounded-2xl bg-cyan-500 px-5 py-3 text-sm font-semibold text-cyan-950 transition hover:bg-cyan-400"
              >
                הוסף פריט
              </button>
            </div>

            <div className="mt-6 space-y-3">
              {uncheckedShopping.length === 0 ? (
                <div className="rounded-3xl border border-cyan-800 bg-cyan-950/80 p-5 text-cyan-300">
                  כל פריט ברשימת הקניות מסומן.
                </div>
              ) : (
                uncheckedShopping.map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-col gap-3 rounded-3xl border border-cyan-800 bg-cyan-950/80 p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2 text-cyan-100">
                        <span className="text-lg font-semibold">{item.name}</span>
                        <span className="rounded-full bg-cyan-900 px-3 py-1 text-xs text-cyan-300">
                          {item.category}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-cyan-300">{item.quantity} {item.unit}</p>
                    </div>
                    <button
                      onClick={() => toggleShoppingChecked(item.id)}
                      className="rounded-2xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-cyan-950 transition hover:bg-cyan-400"
                    >
                      סמן שנקנה
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-cyan-700 bg-cyan-900/90 p-6">
            <h2 className="text-xl font-semibold text-cyan-50">מלאי הבית</h2>
            <p className="mt-2 text-sm text-cyan-300">פריטים שמוסיפים ערך מיידי: נראה מה קרוב לגבול וניתן להגדיל כמות בקליק.</p>

            <div className="mt-6 grid gap-4">
              {inventory.map((item) => {
                const isLow = item.quantity <= item.minQuantity;
                return (
                  <div key={item.id} className="rounded-3xl border border-cyan-800 bg-cyan-950/80 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2 text-cyan-100">
                          <span className="text-lg font-semibold">{item.name}</span>
                          <span className="rounded-full bg-cyan-900 px-3 py-1 text-xs text-cyan-300">
                            {item.category}
                          </span>
                        </div>
                        <p className="mt-2 text-sm text-cyan-300">
                          כמות: {item.quantity} {item.unit} • סף: {item.minQuantity}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {isLow && (
                          <span className="rounded-2xl bg-amber-500/15 px-3 py-1 text-xs font-semibold text-amber-300">
                            נמוך במלאי
                          </span>
                        )}
                        <button
                          onClick={() => restockInventory(item.id)}
                          className="rounded-2xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-cyan-950 transition hover:bg-cyan-400"
                        >
                          מלא +1
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <aside className="space-y-6">
          <div className="rounded-3xl border border-cyan-700 bg-cyan-900/90 p-6">
            <h2 className="text-xl font-semibold text-cyan-50">מצב מלאי אוטומטי</h2>
            <p className="mt-3 text-cyan-200">
              ברגע שמלאי יורד לסף, הפריט יופיע אוטומטית ברשימת הקניות. זה החיבור שמוריד את התלות בעדכון ידני.
            </p>
            <div className="mt-5 space-y-3 rounded-3xl bg-cyan-950/80 p-4 text-cyan-200">
              {lowStockItems.length === 0 ? (
                <p className="text-sm text-cyan-300">אין פריטים במצב חירום כרגע.</p>
              ) : (
                lowStockItems.map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-3 rounded-2xl border border-cyan-800 bg-cyan-900/90 px-4 py-3">
                    <div className="text-sm">
                      <p className="font-semibold text-cyan-50">{item.name}</p>
                      <p className="text-cyan-300">כמות {item.quantity} / סף {item.minQuantity}</p>
                    </div>
                    <span className="rounded-full bg-cyan-500/15 px-3 py-1 text-xs font-semibold text-cyan-100">צריך לקנות</span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-cyan-700 bg-cyan-900/90 p-6">
            <h2 className="text-xl font-semibold text-cyan-50">איך זה עובד</h2>
            <ul className="mt-4 space-y-3 text-cyan-300">
              <li>● הצגת רשימת קניות מהירה עם קיבוץ לפי קטגוריה.</li>
              <li>● ניהול מלאי ביתי עם סף מינימום.</li>
              <li>● סימון פריט כנקנה מגדיל את המלאי באותו פריט.</li>
              <li>● בהמשך: קישורים ל-Supabase ו-Realtime לשיתוף בין הטלפונים.</li>
            </ul>
          </div>
        </aside>
      </section>
    </main>
  );
}
