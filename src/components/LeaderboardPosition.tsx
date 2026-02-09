import React, { useState, useEffect, useRef, memo } from 'react'
import './LeaderboardPosition.css'

interface LeaderboardPositionProps {
    routeNumber: string;
    routeName: string;
    speed: number;
    speedMps?: number;
    showMps?: boolean;
}

function LeaderboardPosition({ routeNumber, routeName, speed, speedMps, showMps = false }: LeaderboardPositionProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [isHovering, setIsHovering] = useState(false);

    const [isMobile, setIsMobile] = useState(window.innerWidth < 500);
    useEffect(() => {
        const handleResize = () => {
            setIsMobile(window.innerWidth < 500);
        };

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);
    // Then use it:
    // Mobile: 40 dashes + 2 = 42 chars, Desktop: 56 dashes + 2 = 58 chars
    // (box slightly bigger than before)
    const borderWidth = isMobile ? 42 : 58;
    const border = isMobile
        ? '+----------------------------------------+'
        : '+--------------------------------------------------------+';

    // Use provided m/s when available; otherwise derive from km/h
    const displayMps = speedMps !== undefined ? speedMps : (Number.isFinite(speed) ? speed / 3.6 : undefined);
    // If the global "showMps" toggle is enabled, always show m/s; otherwise show only on hover/focus
    const shouldShowMps = showMps || isHovering;

    return (
        <div
            className="leaderboard-position"
            ref={containerRef}
            tabIndex={0}
            onMouseEnter={() => setIsHovering(true)}
            onMouseLeave={() => setIsHovering(false)}
            onFocus={() => setIsHovering(true)}
            onBlur={() => setIsHovering(false)}
        >
            <div className="border">
                {border}
            </div>
            <div className="content" style={{ width: `${borderWidth}ch` }}>
                <div className="left-side">
                    |&nbsp;
                    <div className="position-route-number">{routeNumber}</div>
                    &nbsp;-&nbsp;
                    <div className="position-route-name">{routeName}</div>
                </div>
                <div className="right-side">
                    <div className="position-speed">{speed.toFixed(1)} km/h</div>
                    {shouldShowMps && displayMps !== undefined && (
                        <div className="position-speed-ms">{displayMps.toFixed(2)} m/s</div>
                    )}
                    &nbsp;|
                </div>
            </div>
            <div className="border">
                {border}
            </div>
        </div>
    );
}

export default memo(LeaderboardPosition);
