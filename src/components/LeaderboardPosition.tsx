import { useState, useEffect, useRef } from 'react'
import './LeaderboardPosition.css'

interface LeaderboardPosition {
    routeNumber: string;
    routeName: string;
    speed: number;
    speedMps?: number;
}

function LeaderboardPosition({ routeNumber, routeName, speed, speedMps }: LeaderboardPosition) {
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
    // Mobile: 36 dashes + 2 = 38 chars, Desktop: 50 dashes + 2 = 52 chars
    const borderWidth = isMobile ? 38 : 52;
    const border = isMobile
        ? '+------------------------------------+'
        : '+--------------------------------------------------+';

    // 50, 36

    return (
        <div
            className="leaderboard-position"
            ref={containerRef}
            onMouseEnter={() => setIsHovering(true)}
            onMouseLeave={() => setIsHovering(false)}
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
                    {isHovering && speedMps !== undefined && (
                        <div className="position-speed-ms">{speedMps.toFixed(2)} m/s</div>
                    )}
                    <div className="position-speed">{speed.toFixed(1)} km/h</div>
                    &nbsp;|
                </div>
            </div>
            <div className="border">
                {border}
            </div>
        </div>
    );
}

export default LeaderboardPosition;
