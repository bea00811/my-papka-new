import { Navigate } from 'react-router-dom';

import { ROUTE_TRANSFERS } from 'const/routes';
import { useAppSelector } from 'core/store';
import { selectHasPermission } from 'core/store/user';

import SecuritiesCrediting from './SecuritiesCrediting';

const PERMISSION = 'PERSON_NONTRADE_SECURITY_REFILL_EXT';

const SecuritiesCreditingPage = () => {
  const allowed = useAppSelector((state) => selectHasPermission(state, PERMISSION));

  if (!allowed) {
    return <Navigate to={ROUTE_TRANSFERS} replace />;
  }

  return <SecuritiesCrediting />;
};

export default SecuritiesCreditingPage;
