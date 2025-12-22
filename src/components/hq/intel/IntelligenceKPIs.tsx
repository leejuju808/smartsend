import { Card, CardContent } from '@/components/ui/Card';
import { Progress } from '@/components/ui/progress';

interface IntelligenceKPIsProps {
  kpis: {
    mrr?: number;
    arr?: number;
    churn_rate?: number;
    total_orgs?: number;
    total_mrr?: number;
    total_arr?: number;
  };
  accuracy: {
    total_predictions?: number;
    predictions_with_outcomes?: number;
    avg_accuracy?: number;
    avg_confidence?: number;
  };
  feedback: {
    success_rate?: number;
    avg_confidence?: number;
    total_actions?: number;
  };
}

export default function IntelligenceKPIs({ kpis, accuracy, feedback }: IntelligenceKPIsProps) {
  const accuracyPercent = accuracy.avg_accuracy ? (accuracy.avg_accuracy * 100) : 0;
  const confidencePercent = accuracy.avg_confidence ? (accuracy.avg_confidence * 100) : 0;
  const feedbackSuccessPercent = feedback.success_rate ? (feedback.success_rate * 100) : 0;
  
  const items = [
    {
      label: 'MRR',
      value: kpis.mrr !== undefined 
        ? `$${Number(kpis.mrr).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
        : kpis.total_mrr !== undefined
        ? `$${Number(kpis.total_mrr).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
        : '$0',
      trend: null
    },
    {
      label: 'ARR',
      value: kpis.arr !== undefined
        ? `$${Number(kpis.arr).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
        : kpis.total_arr !== undefined
        ? `$${Number(kpis.total_arr).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
        : '$0',
      trend: null
    },
    {
      label: 'Churn Rate',
      value: kpis.churn_rate !== undefined
        ? `${Number(kpis.churn_rate).toFixed(1)}%`
        : 'N/A',
      trend: kpis.churn_rate !== undefined && kpis.churn_rate < 2 ? 'good' : 'warning'
    },
    {
      label: 'Active Orgs',
      value: kpis.total_orgs || 0,
      trend: null
    },
    {
      label: 'Prediction Accuracy',
      value: `${accuracyPercent.toFixed(1)}%`,
      subtitle: `${accuracy.predictions_with_outcomes || 0} validated`,
      trend: accuracyPercent >= 90 ? 'good' : accuracyPercent >= 70 ? 'medium' : 'warning'
    },
    {
      label: 'AI Confidence',
      value: `${confidencePercent.toFixed(1)}%`,
      subtitle: `${accuracy.total_predictions || 0} predictions`,
      trend: confidencePercent >= 85 ? 'good' : confidencePercent >= 70 ? 'medium' : 'warning'
    },
    {
      label: 'Action Success Rate',
      value: `${feedbackSuccessPercent.toFixed(1)}%`,
      subtitle: `${feedback.total_actions || 0} actions`,
      trend: feedbackSuccessPercent >= 80 ? 'good' : feedbackSuccessPercent >= 60 ? 'medium' : 'warning'
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {items.map((item) => (
        <Card key={item.label}>
          <CardContent className="p-6">
            <div className="flex items-start justify-between mb-2">
              <div className="text-xs uppercase opacity-70">{item.label}</div>
              {item.trend && (
                <div className={`text-xs px-2 py-0.5 rounded ${
                  item.trend === 'good' ? 'bg-green-100 text-green-700' :
                  item.trend === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                  'bg-red-100 text-red-700'
                }`}>
                  {item.trend === 'good' ? '✓' : item.trend === 'medium' ? '⚠' : '⚠'}
                </div>
              )}
            </div>
            <div className="text-2xl font-bold mb-1">{item.value}</div>
            {item.subtitle && (
              <div className="text-xs text-gray-500">{item.subtitle}</div>
            )}
            {item.trend && item.trend !== 'good' && (
              <Progress 
                value={
                  item.trend === 'medium' ? 70 : 
                  item.label === 'Prediction Accuracy' ? accuracyPercent :
                  item.label === 'AI Confidence' ? confidencePercent :
                  feedbackSuccessPercent
                } 
                className="mt-2 h-1"
              />
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

