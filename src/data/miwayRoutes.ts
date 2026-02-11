// MiWay Route Reference Data
// Source: Wikipedia - List of MiWay bus routes
// https://en.wikipedia.org/wiki/List_of_MiWay_bus_routes

export type RouteType = 'local' | 'express' | 'school';

export interface MiwayRouteInfo {
  routeNumber: string;
  name: string;
  type: RouteType;
  termini: {
    direction1: string;
    direction2: string;
  };
  availability: string;
}

export const MIWAY_ROUTES: Record<string, MiwayRouteInfo> = {
  '1': { routeNumber: '1', name: 'Dundas', type: 'local', termini: { direction1: 'Kipling Terminal', direction2: 'Ridgeway Drive' }, availability: '24 hours' },
  '1C': { routeNumber: '1C', name: 'Dundas', type: 'local', termini: { direction1: 'Kipling Terminal via UTM', direction2: 'South Common Centre via UTM' }, availability: 'All week' },
  '2': { routeNumber: '2', name: 'Hurontario', type: 'local', termini: { direction1: 'City Centre', direction2: 'Port Credit GO Station' }, availability: '24 hours' },
  '3': { routeNumber: '3', name: 'Bloor', type: 'local', termini: { direction1: 'Kipling Terminal', direction2: 'City Centre' }, availability: '24 hours' },
  '4': { routeNumber: '4', name: 'North Service Road', type: 'local', termini: { direction1: 'Sherway Gardens', direction2: 'Cooksville GO Station' }, availability: 'All week' },
  '5': { routeNumber: '5', name: 'Dixie', type: 'local', termini: { direction1: 'Cardiff Boulevard', direction2: 'Long Branch Loop' }, availability: 'All week' },
  '6': { routeNumber: '6', name: 'Credit Woodlands', type: 'local', termini: { direction1: 'City Centre', direction2: 'Westdale Mall' }, availability: 'All week' },
  '7': { routeNumber: '7', name: 'Airport', type: 'local', termini: { direction1: 'Westwood Square via Renforth', direction2: 'City Centre via Renforth' }, availability: '24 hours' },
  '8': { routeNumber: '8', name: 'Cawthra', type: 'local', termini: { direction1: 'City Centre', direction2: 'Port Credit GO Station' }, availability: 'Mon-Sat' },
  '9': { routeNumber: '9', name: 'Rathburn', type: 'local', termini: { direction1: 'City Centre', direction2: 'Churchill Meadows Community Centre' }, availability: 'All week' },
  '10': { routeNumber: '10', name: 'Bristol', type: 'local', termini: { direction1: 'Meadowvale Town Centre', direction2: 'City Centre' }, availability: 'All week' },
  '11': { routeNumber: '11', name: 'Westwood', type: 'local', termini: { direction1: 'Westwood Square', direction2: 'Kipling Terminal' }, availability: 'All week' },
  '13': { routeNumber: '13', name: 'Glen Erin', type: 'local', termini: { direction1: 'Meadowvale Town Centre', direction2: 'Clarkson GO Station' }, availability: 'All week' },
  '14': { routeNumber: '14', name: 'Lorne Park', type: 'local', termini: { direction1: 'Port Credit GO Station', direction2: 'Clarkson GO Station' }, availability: 'Mon-Fri off-peak' },
  '14A': { routeNumber: '14A', name: 'Lorne Park', type: 'local', termini: { direction1: 'Port Credit GO Station', direction2: 'Winston Churchill Blvd' }, availability: 'Peak hours' },
  '15': { routeNumber: '15', name: 'Drew', type: 'local', termini: { direction1: 'Westwood Square', direction2: 'Cardiff Boulevard' }, availability: 'Mon-Fri' },
  '16': { routeNumber: '16', name: 'Malton', type: 'local', termini: { direction1: 'Westwood Square', direction2: 'Westwood Square (loop)' }, availability: 'Mon-Sat' },
  '16A': { routeNumber: '16A', name: 'Malton', type: 'local', termini: { direction1: 'Westwood Square', direction2: 'Westwood Square (loop)' }, availability: 'All week' },
  '17': { routeNumber: '17', name: 'Hurontario', type: 'local', termini: { direction1: 'Hurontario & 407 Park and Ride', direction2: 'City Centre' }, availability: '24 hours' },
  '18': { routeNumber: '18', name: 'Derry', type: 'local', termini: { direction1: 'Westwood Square', direction2: 'Sheridan College Brampton' }, availability: 'Mon-Fri' },
  '20': { routeNumber: '20', name: 'Rathburn', type: 'local', termini: { direction1: 'Kipling Terminal', direction2: 'City Centre' }, availability: 'All week' },
  '22': { routeNumber: '22', name: 'Finch', type: 'local', termini: { direction1: 'William Osler Health Centre', direction2: 'Westwood Square' }, availability: 'All week' },
  '23': { routeNumber: '23', name: 'Lakeshore', type: 'local', termini: { direction1: 'Long Branch Loop', direction2: 'Clarkson GO Station' }, availability: 'All week' },
  '24': { routeNumber: '24', name: 'Northwest', type: 'local', termini: { direction1: 'Westwood Square', direction2: 'Renforth Station' }, availability: 'Peak hours' },
  '25': { routeNumber: '25', name: 'Traders Loop', type: 'local', termini: { direction1: 'Matheson Boulevard', direction2: 'Matheson Boulevard (loop)' }, availability: 'Peak hours' },
  '26': { routeNumber: '26', name: 'Burnhamthorpe', type: 'local', termini: { direction1: 'Kipling Terminal', direction2: 'South Common Centre' }, availability: 'All week' },
  '28': { routeNumber: '28', name: 'Confederation', type: 'local', termini: { direction1: 'City Centre', direction2: 'Trillium Health Centre' }, availability: 'All week' },
  '29': { routeNumber: '29', name: 'Park Royal', type: 'local', termini: { direction1: 'South Common Centre', direction2: 'Clarkson GO Station' }, availability: 'All week' },
  '30': { routeNumber: '30', name: 'Rexdale', type: 'local', termini: { direction1: 'Bergamot Avenue', direction2: 'Westwood Square' }, availability: 'Mon-Sat' },
  '31': { routeNumber: '31', name: 'Ogden', type: 'local', termini: { direction1: 'Dixie GO Station', direction2: 'Long Branch Loop' }, availability: 'All week' },
  '35': { routeNumber: '35', name: 'Eglinton', type: 'local', termini: { direction1: 'Kipling Terminal', direction2: 'Churchill Meadows Community Centre' }, availability: 'All week' },
  '36': { routeNumber: '36', name: 'Ridgeway', type: 'local', termini: { direction1: 'Winston Churchill Station', direction2: 'South Common Centre' }, availability: 'All week' },
  '38': { routeNumber: '38', name: 'Creditview', type: 'local', termini: { direction1: 'Meadowvale Town Centre', direction2: 'Cooksville GO Station' }, availability: 'All week' },
  '39': { routeNumber: '39', name: 'Britannia', type: 'local', termini: { direction1: 'Renforth Station', direction2: 'Meadowvale Town Centre' }, availability: 'All week' },
  '42': { routeNumber: '42', name: 'Derry', type: 'local', termini: { direction1: 'Westwood Square', direction2: 'Meadowvale Town Centre' }, availability: 'All week' },
  '43': { routeNumber: '43', name: 'Matheson', type: 'local', termini: { direction1: 'Meadowvale Town Centre', direction2: 'Renforth Station' }, availability: 'Peak hours' },
  '44': { routeNumber: '44', name: 'Mississauga Road', type: 'local', termini: { direction1: 'Meadowvale Town Centre', direction2: 'University of Toronto Mississauga' }, availability: 'All week' },
  '45': { routeNumber: '45', name: 'Winston Churchill', type: 'local', termini: { direction1: 'Meadowvale Town Centre', direction2: 'Clarkson GO Station' }, availability: 'All week' },
  '45A': { routeNumber: '45A', name: 'Winston Churchill', type: 'local', termini: { direction1: 'Meadowvale Town Centre', direction2: 'Clarkson GO Station' }, availability: 'Peak hours' },
  '46': { routeNumber: '46', name: 'Tenth Line', type: 'local', termini: { direction1: 'Meadowvale Town Centre', direction2: 'Erin Mills Station' }, availability: 'All week' },
  '48': { routeNumber: '48', name: 'Erin Mills', type: 'local', termini: { direction1: 'Meadowvale Town Centre', direction2: 'South Common Centre' }, availability: 'All week' },
  '49': { routeNumber: '49', name: 'McDowell', type: 'local', termini: { direction1: 'Erin Mills Town Centre', direction2: 'Ninth Line' }, availability: 'Mon-Fri' },
  '49A': { routeNumber: '49A', name: 'McDowell', type: 'local', termini: { direction1: 'Erin Mills Town Centre', direction2: 'Streetsville GO Station' }, availability: 'Peak hours' },
  '51': { routeNumber: '51', name: 'Tomken', type: 'local', termini: { direction1: 'Bramalea GO Station', direction2: 'Stanfield Road' }, availability: 'Mon-Sat' },
  '52B': { routeNumber: '52B', name: 'Lawrence West (TTC)', type: 'local', termini: { direction1: 'Lawrence Station', direction2: 'Westwood Mall' }, availability: 'Mon-Fri' },
  '52D': { routeNumber: '52D', name: 'Lawrence West (TTC)', type: 'local', termini: { direction1: 'Lawrence Station', direction2: 'Victory Crescent' }, availability: 'Weekends' },
  '53': { routeNumber: '53', name: 'Kennedy', type: 'local', termini: { direction1: 'Hurontario & 407 Park and Ride', direction2: 'Cooksville GO Station' }, availability: 'Mon-Fri' },
  '57': { routeNumber: '57', name: 'Courtneypark', type: 'local', termini: { direction1: 'Renforth Station', direction2: 'Sheridan College Brampton' }, availability: 'Mon-Fri' },
  '57A': { routeNumber: '57A', name: 'Courtneypark', type: 'local', termini: { direction1: 'Renforth Station', direction2: 'Sheridan College Brampton' }, availability: 'Mon-Fri' },
  '61': { routeNumber: '61', name: 'Mavis', type: 'local', termini: { direction1: 'Sheridan College Brampton', direction2: 'City Centre' }, availability: 'All week' },
  '66': { routeNumber: '66', name: 'McLaughlin', type: 'local', termini: { direction1: 'Sheridan College Brampton', direction2: 'City Centre' }, availability: 'All week' },
  '68': { routeNumber: '68', name: 'Terry Fox', type: 'local', termini: { direction1: 'Bancroft Drive', direction2: 'City Centre' }, availability: 'All week' },
  '70': { routeNumber: '70', name: 'Keaton', type: 'local', termini: { direction1: 'Kipling Terminal', direction2: 'Milverton Drive' }, availability: 'Peak hours' },
  '71': { routeNumber: '71', name: 'Sheridan', type: 'local', termini: { direction1: 'Kipling Terminal', direction2: 'Sheridan Research Park' }, availability: 'Limited' },
  '73': { routeNumber: '73', name: 'Kamato', type: 'local', termini: { direction1: 'Ambler Drive (Kamato Loop)', direction2: 'Dixie Station' }, availability: 'Peak hours' },
  '74': { routeNumber: '74', name: 'Explorer', type: 'local', termini: { direction1: 'Renforth Station', direction2: 'Dixie Station' }, availability: 'Peak hours' },
  '90': { routeNumber: '90', name: 'Terragar-Copenhagen Loop', type: 'local', termini: { direction1: 'Meadowvale Town Centre', direction2: 'Meadowvale Town Centre' }, availability: 'Mon-Fri' },
  // Express Routes (100s)
  '101': { routeNumber: '101', name: 'Dundas Express', type: 'express', termini: { direction1: 'Kipling Terminal via UTM', direction2: 'South Common Centre via UTM' }, availability: 'Mon-Sat' },
  '101A': { routeNumber: '101A', name: 'Dundas Express', type: 'express', termini: { direction1: 'Kipling Terminal via UTM', direction2: 'Ridgeway Drive via UTM' }, availability: 'Peak hours' },
  '103': { routeNumber: '103', name: 'Hurontario Express', type: 'express', termini: { direction1: 'Brampton Gateway Terminal', direction2: 'Trillium Health Centre' }, availability: 'All week' },
  '107': { routeNumber: '107', name: 'Malton Express', type: 'express', termini: { direction1: 'Humber Polytechnic', direction2: 'City Centre' }, availability: 'All week' },
  '108': { routeNumber: '108', name: 'Financial Express', type: 'express', termini: { direction1: 'Meadowvale Business Park', direction2: 'Kipling Terminal' }, availability: 'Peak hours' },
  '109': { routeNumber: '109', name: 'Meadowvale Express', type: 'express', termini: { direction1: 'Meadowvale Town Centre via City Centre', direction2: 'Kipling Terminal via City Centre' }, availability: 'All week' },
  '110': { routeNumber: '110', name: 'University Express', type: 'express', termini: { direction1: 'City Centre via UTM', direction2: 'Clarkson GO Station via UTM' }, availability: 'All week' },
  '110A': { routeNumber: '110A', name: 'University Express', type: 'express', termini: { direction1: 'City Centre', direction2: 'University of Toronto Mississauga' }, availability: 'Mon-Fri (Sept-Apr)' },
  '126': { routeNumber: '126', name: 'Burnhamthorpe Express', type: 'express', termini: { direction1: 'Kipling Terminal', direction2: 'University of Toronto Mississauga' }, availability: 'Peak hours' },
  '135': { routeNumber: '135', name: 'Eglinton Express', type: 'express', termini: { direction1: 'Renforth Station', direction2: 'Winston Churchill Station' }, availability: 'Peak hours' },
  // School Routes (300s)
  '302': { routeNumber: '302', name: 'Philip Pocock Secondary School', type: 'school', termini: { direction1: 'School', direction2: 'City Centre via Bloor' }, availability: 'School year' },
  '304': { routeNumber: '304', name: 'Father Goetz Secondary School', type: 'school', termini: { direction1: 'School', direction2: 'Various' }, availability: 'School year' },
  '306': { routeNumber: '306', name: 'Streetsville Secondary School', type: 'school', termini: { direction1: 'School', direction2: 'Mavis Road' }, availability: 'School year' },
  '307': { routeNumber: '307', name: 'Philip Pocock Secondary School', type: 'school', termini: { direction1: 'Kipling Terminal', direction2: 'School' }, availability: 'School year' },
  '312': { routeNumber: '312', name: 'Glenforest Secondary School', type: 'school', termini: { direction1: 'School', direction2: 'City Centre' }, availability: 'School year' },
  '313': { routeNumber: '313', name: 'Streetsville Secondary School', type: 'school', termini: { direction1: 'Meadowvale Town Centre', direction2: 'School' }, availability: 'School year' },
  '314': { routeNumber: '314', name: 'Rick Hansen Secondary School', type: 'school', termini: { direction1: 'School', direction2: 'Creditview & Bristol' }, availability: 'School year' },
  '315': { routeNumber: '315', name: 'Rick Hansen Secondary School', type: 'school', termini: { direction1: 'School', direction2: 'City Centre' }, availability: 'School year' },
  '321': { routeNumber: '321', name: 'Stephen Lewis Secondary School', type: 'school', termini: { direction1: 'School & St. Joan of Arc SS', direction2: 'Winston Churchill Blvd' }, availability: 'School year' },
};

export function getRouteInfo(routeNumber: string): MiwayRouteInfo | undefined {
  // Try exact match first
  if (MIWAY_ROUTES[routeNumber]) {
    return MIWAY_ROUTES[routeNumber];
  }
  // Try base route number (e.g., "5N" -> "5")
  const baseRoute = routeNumber.replace(/[A-Z]$/, '');
  return MIWAY_ROUTES[baseRoute];
}

export function getRouteTypeLabel(type: RouteType): string {
  switch (type) {
    case 'express': return 'MiExpress';
    case 'school': return 'School Service';
    default: return 'MiLocal';
  }
}
