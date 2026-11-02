import { useCallback, useEffect, useState } from 'react';
import { getMyTransfers } from '@/lib/api';
import type { TransferView } from '@/types';

/** 나에게 온 / 내가 보낸 대기 중 양도 */
export function useMyTransfers() {
  const [incoming, setIncoming] = useState<TransferView[]>([]);
  const [outgoing, setOutgoing] = useState<TransferView[]>([]);
  const reload = useCallback(() => {
    getMyTransfers()
      .then((r) => {
        setIncoming(r.incoming);
        setOutgoing(r.outgoing);
      })
      .catch(() => {});
  }, []);
  useEffect(reload, [reload]);
  return { incoming, outgoing, reload };
}
