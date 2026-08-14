import ExploreOffOutlinedIcon from '@mui/icons-material/ExploreOffOutlined';
import { useNavigate } from 'react-router-dom';

import { EmptyState } from '../components/EmptyState';

export function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <EmptyState
      icon={<ExploreOffOutlinedIcon />}
      title="This page doesn't exist"
      description="The link may be broken, or the page may have been removed."
      action={{ label: 'Back to feed', onClick: () => navigate('/') }}
    />
  );
}
