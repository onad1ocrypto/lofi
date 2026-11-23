import { MINIMAP_VIEWBOX } from '../game/miniMapLogic';
import type { MiniMapSnapshot } from '../game/types';
import { UI_COPY, formatMiniMapAriaLabel } from '../game/uiCopy';

interface MiniMapProps {
  miniMap: MiniMapSnapshot;
  avalancheDanger: number;
}

/**
 * Compact, high-contrast top-down Alpine Mini Map HUD:
 * - Renders the active level's true winding snow ribbon (start at bottom -> shelter at top)
 * - Displays live Lofi chevron, active follower Yetis, trailing avalanche zone,
 *   ramps, obstacles, and Level 3+ fallen log hurdles
 * - Strictly pointer-events-none so it never steals touch/mouse steering gestures
 */
export function MiniMap({ miniMap, avalancheDanger }: MiniMapProps) {
  const { layout, playerX, playerY, playerHeadingDeg, avalancheX, avalancheY, followers } =
    miniMap;

  const badgeTone =
    layout.difficultyLabel === 'Expert'
      ? 'text-[#FF7597]'
      : layout.difficultyLabel === 'Hard'
        ? 'text-[#FF9E64]'
        : layout.difficultyLabel === 'Medium'
          ? 'text-[#FFD15C]'
          : 'text-[#8FD1FF]';

  const avalFill =
    avalancheDanger > 0.65
      ? 'rgba(239, 68, 68, 0.36)'
      : avalancheDanger > 0.35
        ? 'rgba(245, 158, 11, 0.28)'
        : 'rgba(96, 165, 250, 0.24)';

  const avalStroke =
    avalancheDanger > 0.65
      ? '#F87171'
      : avalancheDanger > 0.35
        ? '#FBBF24'
        : '#7DD3FC';

  const avalHeight = Math.max(0, MINIMAP_VIEWBOX.height - avalancheY);

  return (
    <aside
      aria-label={formatMiniMapAriaLabel(layout.levelNumber, layout.difficultyLabel)}
      data-testid="hud-minimap"
      className="pointer-events-none select-none flex flex-col rounded-lg sm:rounded-xl border border-white/18 bg-[#0a1428]/32 shadow-[0_2px_10px_rgba(8,14,32,0.14)] overflow-hidden w-[66px] sm:w-[90px]"
    >
      {/* Compact Header */}
      <div className="flex items-center justify-between gap-1 px-1.5 py-0.5 sm:px-2 sm:py-1 border-b border-white/10 bg-[#081124]/16">
        <span className="text-[8px] sm:text-[9px] font-extrabold uppercase tracking-wider text-[#E8F2FF] drop-shadow-[0_1px_2px_rgba(6,12,28,0.85)]">
          {UI_COPY.hud.mapHeader}
        </span>
        <span
          className={`text-[8px] sm:text-[9px] font-extrabold uppercase tracking-wider drop-shadow-[0_1px_2px_rgba(6,12,28,0.85)] ${badgeTone}`}
          data-testid="minimap-difficulty"
        >
          <span className="hidden sm:inline">{layout.difficultyLabel}</span>
          <span className="sm:hidden">LV {layout.levelNumber}</span>
        </span>
      </div>

      {/* Top-Down Winding Track SVG */}
      <div className="relative w-full aspect-[112/224]">
        <svg
          viewBox={`0 0 ${MINIMAP_VIEWBOX.width} ${MINIMAP_VIEWBOX.height}`}
          className="w-full h-full block"
          role="img"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="minimap-bg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(10, 20, 42, 0.08)" />
              <stop offset="100%" stopColor="rgba(16, 28, 56, 0.14)" />
            </linearGradient>
            <clipPath id="minimap-ribbon-clip">
              <path d={layout.ribbonPath} />
            </clipPath>
          </defs>

          {/* Subtle alpine slate backdrop + horizontal distance reference ticks */}
          <rect
            x="0"
            y="0"
            width={MINIMAP_VIEWBOX.width}
            height={MINIMAP_VIEWBOX.height}
            fill="url(#minimap-bg)"
          />
          <line x1="8" y1="68" x2="104" y2="68" stroke="rgba(215,232,255,0.12)" strokeWidth="1" />
          <line x1="8" y1="116" x2="104" y2="116" stroke="rgba(215,232,255,0.12)" strokeWidth="1" />
          <line x1="8" y1="164" x2="104" y2="164" stroke="rgba(215,232,255,0.12)" strokeWidth="1" />

          {/* Groomed Snow Track Ribbon */}
          <path
            d={layout.ribbonPath}
            fill="rgba(232, 244, 255, 0.26)"
            stroke="rgba(175, 216, 255, 0.62)"
            strokeWidth="1.4"
            strokeLinejoin="round"
            data-testid="minimap-ribbon"
          />

          {/* Subtle Centerline Guide */}
          <path
            d={layout.centerlinePath}
            fill="none"
            stroke="rgba(255, 255, 255, 0.22)"
            strokeWidth="0.9"
            strokeDasharray="3 3"
          />

          {/* Trailing Avalanche Zone Clipped to Track Ribbon */}
          <g clipPath="url(#minimap-ribbon-clip)">
            <rect
              x="0"
              y={avalancheY}
              width={MINIMAP_VIEWBOX.width}
              height={avalHeight}
              fill={avalFill}
            />
            <line
              x1="0"
              y1={avalancheY}
              x2={MINIMAP_VIEWBOX.width}
              y2={avalancheY}
              stroke={avalStroke}
              strokeWidth="2.2"
            />
          </g>

          {/* Obstacles (pines = emerald dots, rocks = cool slate dots, fallen logs = amber-red bars) */}
          <g data-testid="minimap-obstacles">
            {layout.obstacles.map((obs, idx) =>
              obs.kind === 'fallen_log' ? (
                <line
                  key={`log-${idx}`}
                  x1={obs.x - 9}
                  y1={obs.y}
                  x2={obs.x + 9}
                  y2={obs.y}
                  stroke="#FB7185"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                />
              ) : (
                <circle
                  key={`obs-${idx}`}
                  cx={obs.x}
                  cy={obs.y}
                  r={obs.kind === 'pine' ? 1.55 : 1.35}
                  fill={obs.kind === 'pine' ? '#4ADE80' : '#CBD5E1'}
                  opacity="0.88"
                />
              ),
            )}
          </g>

          {/* Snow Ramps */}
          <g>
            {layout.ramps.map((r, idx) => (
              <path
                key={`ramp-${idx}`}
                d={`M ${r.x - 3.2} ${r.y + 1.8} L ${r.x} ${r.y - 2.4} L ${r.x + 3.2} ${r.y + 1.8}`}
                fill="none"
                stroke={r.kind === 'bonus' ? '#38BDF8' : '#FBBF24'}
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
          </g>

          {/* Finish Shelter Beacon at Top */}
          <g transform={`translate(${layout.shelterX}, ${layout.shelterY})`}>
            <circle r="6.2" fill="rgba(255, 179, 71, 0.25)" />
            <path
              d="M -4.5 0.5 L 0 -4.2 L 4.5 0.5 L 3.4 0.5 L 3.4 4.2 L -3.4 4.2 L -3.4 0.5 Z"
              fill="#FFB347"
              stroke="#141E38"
              strokeWidth="1.1"
              strokeLinejoin="round"
            />
          </g>

          {/* Avalanche Crest Marker Dot */}
          <circle
            cx={avalancheX}
            cy={avalancheY}
            r="2.4"
            fill={avalStroke}
            opacity="0.9"
          />

          {/* Active Follower Yetis behind Lofi */}
          {followers.map((f, idx) => (
            <circle
              key={`f-${idx}`}
              cx={f.x}
              cy={f.y}
              r="2.5"
              fill="#D946EF"
              stroke="#FFD15C"
              strokeWidth="1"
            />
          ))}

          {/* Lofi Live Player Chevron */}
          <g
            transform={`translate(${playerX}, ${playerY}) rotate(${playerHeadingDeg})`}
            data-testid="minimap-player"
          >
            <circle r="6.5" fill="rgba(255, 122, 38, 0.28)" />
            <path
              d="M 0 -5.2 L 4.3 4.2 L 0 2.0 L -4.3 4.2 Z"
              fill="#FF7A26"
              stroke="#FFFFFF"
              strokeWidth="1.35"
              strokeLinejoin="round"
            />
          </g>
        </svg>
      </div>
    </aside>
  );
}
