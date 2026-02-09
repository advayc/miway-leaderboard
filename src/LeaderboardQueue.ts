export interface LeaderboardData {
    routeNumber: string;
    routeName: string;
    speed: number;
    speedMps?: number;
}

export class LeaderboardQueue {
    private items: LeaderboardData[] = [];

    // Add to the back of the queue
    append(item: LeaderboardData): void {
        this.items.push(item);
    }

    // Add multiple items - update if exists, append if not
    upsertAll(items: LeaderboardData[]): void {
        for (const item of items) {
            const existingIndex = this.items.findIndex(
                existing => existing.routeNumber === item.routeNumber
            );

            if (existingIndex !== -1) {
                // Update existing item's speed
                this.items[existingIndex].speed = item.speed;
                this.items[existingIndex].speedMps = item.speedMps;
                this.items[existingIndex].routeName = item.routeName;
            } else {
                // Append new item
                this.items.push(item);
            }
        }
    }

    // Remove and return from the front
    popFront(): LeaderboardData | undefined {
        return this.items.shift();
    }

    // Peek at the front without removing
    peekFront(): LeaderboardData | undefined {
        return this.items[0];
    }

    // Check if queue is empty
    isEmpty(): boolean {
        return this.items.length === 0;
    }

    // Get current size
    size(): number {
        return this.items.length;
    }

    // Clear the queue
    clear(): void {
        this.items = [];
    }
}
