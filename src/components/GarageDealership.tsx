import React, { useState } from 'react';
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronUp,
  Lock,
  Palette,
  RotateCcw,
  ShoppingBag,
  Sparkles,
  Warehouse,
  Wrench,
  Zap,
} from 'lucide-react';
import {
  CAR_CATALOG,
  getCarSpec,
  getDefaultCustomization,
  getDefaultUpgrades,
  getEffectiveCarStats,
  isRankAtLeast,
  RANK_INFO,
  UPGRADE_COSTS,
} from '../data/cars';
import { audioEngine } from '../engine/audio';
import {
  CarCategory,
  CarCustomization,
  CarUpgrades,
  OwnedCarData,
  PaintFinish,
  PlayerSaveData,
} from '../types/game';

interface GarageDealershipProps {
  initialTab: 'garage' | 'dealership' | 'customization';
  save: PlayerSaveData;
  activeCar: OwnedCarData;
  onBack: () => void;
  onPreviewCar: (carData: OwnedCarData) => void;
  onSelectCar: (carId: string) => void;
  onBuyCar: (carId: string) => { ok: boolean; reason?: string };
  onUpdateCustomization: (
    carId: string,
    patch: Partial<CarCustomization>,
  ) => void;
  onBuyUpgrade: (carId: string, part: keyof CarUpgrades) => boolean;
  onDriveNow: () => void;
  onResetOrbit: () => void;
}

const PAINT_SWATCHES = [
  '#0284c7',
  '#e11d48',
  '#dc2626',
  '#f97316',
  '#f59e0b',
  '#22c55e',
  '#1d4ed8',
  '#a855f7',
  '#f8fafc',
  '#cbd5e1',
  '#272a33',
  '#090a0d',
];

const NEON_SWATCHES = [
  'none',
  '#0284c7',
  '#e11d48',
  '#22c55e',
  '#a855f7',
  '#f59e0b',
  '#ffffff',
];

export const GarageDealership: React.FC<GarageDealershipProps> = ({
  initialTab,
  save,
  activeCar,
  onBack,
  onPreviewCar,
  onSelectCar,
  onBuyCar,
  onUpdateCustomization,
  onBuyUpgrade,
  onDriveNow,
  onResetOrbit,
}) => {
  const [tab, setTab] = useState<'garage' | 'dealership' | 'customization'>(
    initialTab,
  );
  const [customSubTab, setCustomSubTab] = useState<
    'paint' | 'aero' | 'neon' | 'upgrades'
  >('paint');
  const [category, setCategory] = useState<'ALL' | CarCategory>('ALL');
  const [previewId, setPreviewId] = useState<string>(activeCar.carId);
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  };

  const inspectedOwned = save.ownedCars[previewId];
  const inspectedSpec = getCarSpec(previewId);
  const inspectedData: OwnedCarData = inspectedOwned ?? {
    carId: previewId,
    customization: getDefaultCustomization(inspectedSpec),
    upgrades: getDefaultUpgrades(),
    mileageKm: 0,
  };
  const stats = getEffectiveCarStats(inspectedSpec, inspectedData.upgrades);

  const filteredCars = CAR_CATALOG.filter((c) => {
    const catMatch = category === 'ALL' || c.category === category;
    if (!catMatch) return false;
    if (tab === 'garage') return Boolean(save.ownedCars[c.id]);
    return true;
  });

  const handleInspect = (carId: string) => {
    audioEngine.playUiClick();
    setPreviewId(carId);
    const owned = save.ownedCars[carId];
    if (owned) {
      onPreviewCar(owned);
    } else {
      const s = getCarSpec(carId);
      onPreviewCar({
        carId,
        customization: getDefaultCustomization(s),
        upgrades: getDefaultUpgrades(),
        mileageKm: 0,
      });
    }
  };

  const handleSelectOrBuy = (carId: string) => {
    audioEngine.playUiClick();
    if (save.ownedCars[carId]) {
      onSelectCar(carId);
      onPreviewCar(save.ownedCars[carId]);
      showToast(`${getCarSpec(carId).name} selected as active ride`);
    } else {
      const res = onBuyCar(carId);
      if (res.ok) {
        const spec = getCarSpec(carId);
        onPreviewCar({
          carId,
          customization: getDefaultCustomization(spec),
          upgrades: getDefaultUpgrades(),
          mileageKm: 0,
        });
        showToast(`Purchased ${spec.name}!`);
      } else {
        showToast(res.reason ?? 'Cannot purchase');
      }
    }
  };

  const handleCustomChange = (patch: Partial<CarCustomization>) => {
    if (!inspectedOwned) return;
    audioEngine.playUiClick();
    onUpdateCustomization(inspectedOwned.carId, patch);
    onPreviewCar({
      ...inspectedOwned,
      customization: { ...inspectedOwned.customization, ...patch },
    });
  };

  const handleBack = () => {
    audioEngine.playUiClick();
    onPreviewCar(activeCar);
    onBack();
  };

  return (
    <div className="fixed inset-0 z-20 pointer-events-none flex flex-col justify-between p-3 sm:p-6">
      {/* Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 pointer-events-auto">
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={handleBack}
            className="flex items-center gap-1.5 bg-black/60 hover:bg-black/80 border border-white/15 text-slate-100 px-3 py-2 text-xs font-display tracking-wider cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4 text-rose-500" />
            MENU
          </button>

          <div className="flex bg-black/60 border border-white/15 p-0.5">
            <button
              onClick={() => {
                audioEngine.playUiClick();
                setTab('garage');
                handleInspect(activeCar.carId);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-display tracking-wider cursor-pointer ${
                tab === 'garage'
                  ? 'bg-rose-600 text-white font-bold'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Warehouse className="w-3.5 h-3.5" />
              GARAGE
            </button>
            <button
              onClick={() => {
                audioEngine.playUiClick();
                setTab('dealership');
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-display tracking-wider cursor-pointer ${
                tab === 'dealership'
                  ? 'bg-rose-600 text-white font-bold'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              DEALERSHIP
            </button>
            <button
              onClick={() => {
                audioEngine.playUiClick();
                setTab('customization');
                handleInspect(activeCar.carId);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-display tracking-wider cursor-pointer ${
                tab === 'customization'
                  ? 'bg-rose-600 text-white font-bold'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Wrench className="w-3.5 h-3.5" />
              CUSTOMIZE
            </button>
          </div>
        </div>

        {/* Spec & Cash Summary */}
        <div className="flex items-center gap-3 bg-black/60 border border-white/15 px-3.5 py-1.5">
          <div className="text-right pr-3 border-r border-white/15">
            <div className="text-[9px] font-display text-slate-400">
              {inspectedSpec.inspiredBy} · {inspectedSpec.drivetrain}
            </div>
            <div className="font-display font-bold text-xs sm:text-sm text-white">
              {inspectedSpec.name}
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-3 pr-3 border-r border-white/15 font-mono-num text-xs tabular-nums">
            <span className="text-slate-200">{stats.horsepower} HP</span>
            <span className="text-rose-400">{stats.topSpeedKmh} KM/H</span>
            <span className="text-slate-400">HND {stats.handlingRating}</span>
          </div>
          <div className="font-mono-num text-xs sm:text-sm font-bold text-emerald-400 tabular-nums">
            ${save.money.toLocaleString()}
          </div>
          <button
            onClick={() => {
              audioEngine.playUiClick();
              onResetOrbit();
            }}
            title="Reset 360 Camera"
            className="p-1.5 text-slate-300 hover:text-white border border-white/15 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {toast && (
        <div className="mx-auto bg-rose-600 text-white font-display text-xs tracking-widest uppercase px-4 py-1.5 shadow-lg">
          {toast}
        </div>
      )}

      {/* Collapsible Bottom Dock */}
      <div className="pointer-events-auto mx-auto w-full max-w-5xl flex flex-col items-center">
        <button
          onClick={() => setDockCollapsed((c) => !c)}
          className="flex items-center gap-1.5 bg-black/75 border border-b-0 border-white/15 px-4 py-1 text-[10px] font-display tracking-widest text-slate-300 hover:text-white cursor-pointer"
        >
          {dockCollapsed ? (
            <>
              <ChevronUp className="w-3.5 h-3.5 text-rose-500" /> SHOW CONTROLS
            </>
          ) : (
            <>
              <ChevronDown className="w-3.5 h-3.5 text-rose-500" /> HIDE CONTROLS
            </>
          )}
        </button>

        {!dockCollapsed && (
          <div className="w-full bg-[#0a0d14]/90 border border-white/15 p-3 sm:p-4 shadow-2xl">
            {(tab === 'garage' || tab === 'dealership') && (
              <div className="space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-1.5">
                    {(['ALL', 'SUPERCARS', 'SPORTS'] as const).map((cat) => (
                      <button
                        key={cat}
                        onClick={() => {
                          audioEngine.playUiClick();
                          setCategory(cat);
                        }}
                        className={`px-2.5 py-1 text-[11px] font-display tracking-wider cursor-pointer border ${
                          category === cat
                            ? 'bg-rose-600 border-rose-500 text-white font-bold'
                            : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-100'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-2">
                    {inspectedOwned ? (
                      <>
                        {save.activeCarId !== previewId && (
                          <button
                            onClick={() => handleSelectOrBuy(previewId)}
                            className="bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white px-3.5 py-1.5 text-xs font-display font-bold tracking-wider cursor-pointer"
                          >
                            SET ACTIVE
                          </button>
                        )}
                        <button
                          onClick={() => {
                            onSelectCar(previewId);
                            onDriveNow();
                          }}
                          className="bg-rose-600 hover:bg-rose-500 text-white px-4 py-1.5 text-xs font-display font-bold tracking-wider cursor-pointer"
                        >
                          DRIVE NOW
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => handleSelectOrBuy(previewId)}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-1.5 text-xs font-display font-bold tracking-wider cursor-pointer"
                      >
                        BUY FOR ${inspectedSpec.price.toLocaleString()}
                      </button>
                    )}
                  </div>
                </div>

                {/* Horizontal 6-Car Fleet Carousel */}
                <div className="flex gap-2.5 overflow-x-auto pb-1">
                  {filteredCars.map((car) => {
                    const owned = Boolean(save.ownedCars[car.id]);
                    const isSelected = previewId === car.id;
                    const isActive = save.activeCarId === car.id;
                    const rankOk = isRankAtLeast(save.rank, car.unlockRank);
                    return (
                      <button
                        key={car.id}
                        onClick={() => handleInspect(car.id)}
                        className={`shrink-0 w-48 text-left p-2.5 border transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-slate-900 border-rose-500'
                            : 'bg-[#0d1017] border-slate-800 hover:border-slate-600'
                        }`}
                      >
                        <div className="flex items-center justify-between text-[10px] font-display tracking-wider">
                          <span className="text-slate-400">{car.category}</span>
                          {isActive ? (
                            <span className="text-rose-400 font-bold">ACTIVE</span>
                          ) : owned ? (
                            <span className="text-emerald-400 flex items-center gap-0.5">
                              <Check className="w-3 h-3" /> OWNED
                            </span>
                          ) : !rankOk ? (
                            <span className="text-amber-400 flex items-center gap-0.5">
                              <Lock className="w-3 h-3" /> {RANK_INFO[car.unlockRank].label.split(' ')[0]}
                            </span>
                          ) : (
                            <span className="font-mono-num text-emerald-400">
                              ${(car.price / 1000).toFixed(0)}K
                            </span>
                          )}
                        </div>
                        <div className="font-display font-bold text-xs text-slate-100 truncate mt-1">
                          {car.name}
                        </div>
                        <div className="flex items-center justify-between text-[10px] font-mono-num text-slate-400 mt-1.5 tabular-nums">
                          <span>{car.horsepower} HP</span>
                          <span>{car.topSpeedKmh} KM/H</span>
                          <span>{car.drivetrain}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {tab === 'customization' && inspectedOwned && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex gap-1.5">
                    {(
                      [
                        { id: 'paint', label: 'PAINT', icon: <Palette className="w-3.5 h-3.5" /> },
                        { id: 'aero', label: 'AERO & RIMS', icon: <Wrench className="w-3.5 h-3.5" /> },
                        { id: 'neon', label: 'NEON & TINT', icon: <Sparkles className="w-3.5 h-3.5" /> },
                        { id: 'upgrades', label: 'PERFORMANCE', icon: <Zap className="w-3.5 h-3.5" /> },
                      ] as const
                    ).map((st) => (
                      <button
                        key={st.id}
                        onClick={() => {
                          audioEngine.playUiClick();
                          setCustomSubTab(st.id);
                        }}
                        className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-display tracking-wider border cursor-pointer ${
                          customSubTab === st.id
                            ? 'bg-rose-600 border-rose-500 text-white font-bold'
                            : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                        }`}
                      >
                        {st.icon}
                        {st.label}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => {
                      onSelectCar(inspectedOwned.carId);
                      onDriveNow();
                    }}
                    className="bg-rose-600 hover:bg-rose-500 text-white px-4 py-1.5 text-xs font-display font-bold tracking-wider cursor-pointer"
                  >
                    TEST DRIVE
                  </button>
                </div>

                {customSubTab === 'paint' && (
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex flex-wrap gap-2">
                      {PAINT_SWATCHES.map((hex) => (
                        <button
                          key={hex}
                          onClick={() => handleCustomChange({ paintColor: hex })}
                          className={`w-7 h-7 border-2 cursor-pointer ${
                            inspectedOwned.customization.paintColor === hex
                              ? 'border-white scale-110'
                              : 'border-slate-700'
                          }`}
                          style={{ backgroundColor: hex }}
                          aria-label={`Paint ${hex}`}
                        />
                      ))}
                    </div>
                    <div className="flex gap-1.5">
                      {(['gloss', 'metallic', 'matte'] as PaintFinish[]).map((f) => (
                        <button
                          key={f}
                          onClick={() => handleCustomChange({ paintFinish: f })}
                          className={`px-3 py-1.5 text-xs font-display uppercase border cursor-pointer ${
                            inspectedOwned.customization.paintFinish === f
                              ? 'bg-slate-100 text-black font-bold border-white'
                              : 'bg-slate-900 text-slate-300 border-slate-700'
                          }`}
                        >
                          {f}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {customSubTab === 'aero' && (
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
                    <div>
                      <div className="text-[10px] font-display text-slate-400 mb-1">BODY KIT</div>
                      <div className="flex flex-wrap gap-1">
                        {(['stock', 'street', 'widebody_gt'] as const).map((k) => (
                          <button
                            key={k}
                            onClick={() => handleCustomChange({ bodyKit: k })}
                            className={`px-2 py-1 border font-display text-[11px] uppercase cursor-pointer ${
                              inspectedOwned.customization.bodyKit === k
                                ? 'bg-rose-600 border-rose-500 text-white'
                                : 'bg-slate-900 border-slate-800 text-slate-300'
                            }`}
                          >
                            {k.replace('_', ' ')}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-display text-slate-400 mb-1">SPOILER</div>
                      <div className="flex flex-wrap gap-1">
                        {(['none', 'lip', 'gt_wing', 'swan_neck'] as const).map((sp) => (
                          <button
                            key={sp}
                            onClick={() => handleCustomChange({ spoiler: sp })}
                            className={`px-2 py-1 border font-display text-[11px] uppercase cursor-pointer ${
                              inspectedOwned.customization.spoiler === sp
                                ? 'bg-rose-600 border-rose-500 text-white'
                                : 'bg-slate-900 border-slate-800 text-slate-300'
                            }`}
                          >
                            {sp.replace('_', ' ')}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-display text-slate-400 mb-1">RIMS</div>
                      <div className="flex flex-wrap gap-1">
                        {(
                          [
                            ['sport_5', '5-SPOKE'],
                            ['mesh_gt', 'MESH'],
                            ['blade_aero', 'AERO'],
                          ] as const
                        ).map(([rId, label]) => (
                          <button
                            key={rId}
                            onClick={() => handleCustomChange({ rimStyle: rId })}
                            className={`px-2 py-1 border font-display text-[11px] cursor-pointer ${
                              inspectedOwned.customization.rimStyle === rId
                                ? 'bg-rose-600 border-rose-500 text-white'
                                : 'bg-slate-900 border-slate-800 text-slate-300'
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-display text-slate-400 mb-1">EXHAUST</div>
                      <div className="flex flex-wrap gap-1">
                        {(['dual', 'quad', 'titanium_center'] as const).map((ex) => (
                          <button
                            key={ex}
                            onClick={() => handleCustomChange({ exhaust: ex })}
                            className={`px-2 py-1 border font-display text-[11px] uppercase cursor-pointer ${
                              inspectedOwned.customization.exhaust === ex
                                ? 'bg-rose-600 border-rose-500 text-white'
                                : 'bg-slate-900 border-slate-800 text-slate-300'
                            }`}
                          >
                            {ex.replace('_', ' ')}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {customSubTab === 'neon' && (
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <div className="text-[10px] font-display text-slate-400 mb-1.5">
                        UNDERGLOW NEON
                      </div>
                      <div className="flex gap-2">
                        {NEON_SWATCHES.map((hex) => (
                          <button
                            key={hex}
                            onClick={() => handleCustomChange({ neonColor: hex })}
                            className={`w-7 h-7 border text-[10px] font-display flex items-center justify-center cursor-pointer ${
                              inspectedOwned.customization.neonColor === hex
                                ? 'border-white scale-110'
                                : 'border-slate-700'
                            }`}
                            style={{
                              backgroundColor: hex === 'none' ? '#111827' : hex,
                            }}
                          >
                            {hex === 'none' ? 'OFF' : ''}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="w-56">
                      <div className="flex justify-between text-[10px] font-display text-slate-400 mb-1">
                        <span>WINDOW TINT</span>
                        <span className="font-mono-num text-slate-200">
                          {Math.round(inspectedOwned.customization.windowTint * 100)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0.15}
                        max={0.85}
                        step={0.05}
                        value={inspectedOwned.customization.windowTint}
                        onChange={(e) =>
                          handleCustomChange({
                            windowTint: parseFloat(e.target.value),
                          })
                        }
                        className="w-full accent-rose-600 cursor-pointer"
                      />
                    </div>
                  </div>
                )}

                {customSubTab === 'upgrades' && (
                  <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
                    {(
                      [
                        ['engine', 'ENGINE'],
                        ['turbo', 'TURBO'],
                        ['tires', 'TIRES'],
                        ['suspension', 'SUSPENSION'],
                        ['brakes', 'BRAKES'],
                        ['nitro', 'NITRO'],
                      ] as Array<[keyof CarUpgrades, string]>
                    ).map(([partKey, label]) => {
                      const lvl = inspectedOwned.upgrades[partKey];
                      const nextCost = lvl < 3 ? UPGRADE_COSTS[lvl + 1] : 0;
                      return (
                        <button
                          key={partKey}
                          disabled={lvl >= 3}
                          onClick={() => {
                            audioEngine.playUiClick();
                            const ok = onBuyUpgrade(inspectedOwned.carId, partKey);
                            if (!ok) showToast('Insufficient credits for upgrade');
                            else showToast(`${label} upgraded to Stage ${lvl + 1}!`);
                          }}
                          className="bg-slate-900 hover:bg-slate-800 disabled:opacity-65 border border-slate-700 p-2 text-left cursor-pointer"
                        >
                          <div className="flex justify-between text-[10px] font-display text-slate-300">
                            <span>{label}</span>
                            <span className="text-rose-400">STG {lvl}/3</span>
                          </div>
                          <div className="flex gap-1 my-1.5">
                            {[1, 2, 3].map((step) => (
                              <div
                                key={step}
                                className={`h-1 flex-1 ${
                                  lvl >= step ? 'bg-rose-500' : 'bg-slate-700'
                                }`}
                              />
                            ))}
                          </div>
                          <div className="font-mono-num text-[10px] text-emerald-400">
                            {lvl >= 3 ? 'MAXED' : `$${nextCost.toLocaleString()}`}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
