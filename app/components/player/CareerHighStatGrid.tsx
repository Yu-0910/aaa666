"use client"

import type { CareerHighBattingCard } from "@/lib/playerCareerHighBatting"

const CAREER_HIGH_CARD_SCALE_CQW = 8.5
const CAREER_HIGH_CARD_BORDER_EM = 0.107 * 0.6
const CAREER_HIGH_LABEL_EM = 0.684
const CAREER_HIGH_LABEL_PAD_EM = 1.364
const CAREER_HIGH_LABEL_TEXT_SCALE = 0.6 * 0.8
const CAREER_HIGH_LABEL_BG_HEIGHT_SCALE = 0.9 * 0.7
const CAREER_HIGH_LABEL_BG_TOP_EM = 0.17
const CAREER_HIGH_LABEL_TEXT_OFFSET_EM = 0.06
const CAREER_HIGH_LABEL_TEXT_LETTER_SPACING_EM = 0.05
const CAREER_HIGH_LABEL_BG_WIDTH_EXTRA_SCALE = 1.1
const CAREER_HIGH_VALUE_TOP_PERCENT = 50
const CAREER_HIGH_LABEL_BG_WIDTH_SCALE = 1.3
const CAREER_HIGH_LABEL_BG_WIDTH_FINAL_SCALE = 0.8
const CAREER_HIGH_LABEL_BG_WIDTH_EM =
  (CAREER_HIGH_LABEL_PAD_EM * CAREER_HIGH_LABEL_BG_WIDTH_SCALE * 2 +
    CAREER_HIGH_LABEL_EM * 2.5) *
  CAREER_HIGH_LABEL_BG_WIDTH_FINAL_SCALE *
  CAREER_HIGH_LABEL_BG_WIDTH_EXTRA_SCALE
const CAREER_HIGH_LABEL_BG_MAX_WIDTH_PERCENT = 76 * CAREER_HIGH_LABEL_BG_WIDTH_EXTRA_SCALE
const CAREER_HIGH_VALUE_EM = 2.3 * 0.4 * 1.1

export function CareerHighStatGrid({
  cards,
  isMobile,
  className = "mb-12",
}: {
  cards: CareerHighBattingCard[]
  isMobile: boolean
  className?: string
}) {
  return (
    <div className={isMobile ? `grid grid-cols-3 gap-2 ${className}` : `grid grid-cols-3 gap-4 ${className}`}>
      {cards.map((stat) => (
        <div
          key={stat.title}
          data-career-high-card-title={stat.title}
          className="overflow-hidden"
          style={{
            containerType: "inline-size",
            fontSize: `${CAREER_HIGH_CARD_SCALE_CQW}cqw`,
            backgroundColor: "#000000",
            border: `${CAREER_HIGH_CARD_BORDER_EM}em solid #555555`,
            borderRadius: "0.14em",
            boxShadow: "0 0.25em 0.625em rgba(0,0,0,0.5)",
            aspectRatio: "3 / 2",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            data-career-high-label-shell
            className="latin tabular-nums tracking-tight"
            style={{
              position: "relative",
              flexShrink: 0,
              width: "100%",
              backgroundColor: "#000000",
              paddingTop: `${CAREER_HIGH_LABEL_BG_TOP_EM}em`,
              height: `calc(${CAREER_HIGH_LABEL_BG_TOP_EM}em + ${CAREER_HIGH_LABEL_EM * CAREER_HIGH_LABEL_BG_HEIGHT_SCALE}em)`,
            }}
          >
            <div
              aria-hidden
              data-career-high-label-bg
              style={{
                position: "absolute",
                left: "50%",
                top: `${CAREER_HIGH_LABEL_BG_TOP_EM}em`,
                transform: "translateX(-50%)",
                width: `min(${CAREER_HIGH_LABEL_BG_WIDTH_EM}em, ${CAREER_HIGH_LABEL_BG_MAX_WIDTH_PERCENT}%)`,
                height: `${CAREER_HIGH_LABEL_EM * CAREER_HIGH_LABEL_BG_HEIGHT_SCALE}em`,
                backgroundColor: "#FFFF44",
                borderRadius: `${CAREER_HIGH_LABEL_EM * 0.28}em`,
              }}
            />
            <div
              data-career-high-label-wrap
              className="absolute z-[1] flex items-center justify-center"
              style={{
                left: "50%",
                top: `${CAREER_HIGH_LABEL_BG_TOP_EM}em`,
                transform: "translateX(-50%)",
                width: `min(${CAREER_HIGH_LABEL_BG_WIDTH_EM}em, ${CAREER_HIGH_LABEL_BG_MAX_WIDTH_PERCENT}%)`,
                height: `${CAREER_HIGH_LABEL_EM * CAREER_HIGH_LABEL_BG_HEIGHT_SCALE}em`,
              }}
            >
              <span
                data-career-high-label
                className="font-light leading-none whitespace-nowrap"
                style={{
                  color: "#000000",
                  fontWeight: 900,
                  fontSize: `${CAREER_HIGH_LABEL_EM * CAREER_HIGH_LABEL_TEXT_SCALE}em`,
                  letterSpacing: `${CAREER_HIGH_LABEL_TEXT_LETTER_SPACING_EM}em`,
                  transform: `translateY(${CAREER_HIGH_LABEL_TEXT_OFFSET_EM}em)`,
                  whiteSpace: "nowrap",
                  wordBreak: "keep-all",
                }}
              >
                {stat.title}
              </span>
            </div>
          </div>
          <div
            className="flex-1 relative min-h-0"
            style={{ backgroundColor: "#000000", paddingLeft: "0.5em", paddingRight: "0.5em" }}
          >
            <div
              className="absolute inset-x-0 flex justify-center"
              style={{
                top: `${CAREER_HIGH_VALUE_TOP_PERCENT}%`,
                transform: "translateY(-50%)",
                paddingLeft: "0.5em",
                paddingRight: "0.5em",
              }}
            >
              <div
                data-career-high-value
                className="font-black leading-none"
                style={{
                  flexShrink: 0,
                  fontSize: `${CAREER_HIGH_VALUE_EM}em`,
                  lineHeight: 1,
                  fontFamily: 'var(--font-bebas-neue), "Bebas Neue", sans-serif',
                  letterSpacing: "0.032em",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {stat.value}
              </div>
            </div>
          </div>
          {stat.year ? (
            <div className="px-2 py-1 text-center text-sm" style={{ backgroundColor: "#1f1f1f" }}>
              {stat.year}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  )
}
