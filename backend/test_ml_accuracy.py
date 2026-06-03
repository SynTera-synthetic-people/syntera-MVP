"""
Test ML Model Accuracy - Quick verification of model performance
"""
import pandas as pd
import numpy as np
from app.ml.models.predict import MLPredictor
from sklearn.metrics import r2_score, mean_absolute_error, mean_squared_error
import warnings
import os

warnings.filterwarnings('ignore')

def test_domain_accuracy(domain, features_df, sample_size=100):
    """Test accuracy for a specific domain"""
    print(f"\n{'='*70}")
    print(f"TESTING {domain.upper()} MODELS")
    print(f"{'='*70}")
    
    # Filter to domain
    domain_data = features_df[features_df['domain'] == domain].copy()
    
    if len(domain_data) == 0:
        print(f"❌ No data for {domain}")
        return None
    
    # Sample if too large
    if len(domain_data) > sample_size:
        domain_data = domain_data.sample(sample_size, random_state=42)
    
    print(f"Testing on {len(domain_data)} samples")
    
    try:
        # Initialize predictor with domain
        predictor = MLPredictor(domain=domain)
        
        # CRITICAL: Use ONLY the features the model expects, in the right order
        expected_features = predictor.feature_columns
        print(f"Expected features: {len(expected_features)}")
        
        # Select and reorder features
        X = domain_data[expected_features].copy()
        X = X.astype(float)
        y_true = domain_data['orders_per_week'].values.astype(float)
        
        # Make predictions
        print(f"Making predictions for {len(X)} samples...")
        y_pred = []
        for i in range(len(X)):
            pred = predictor.predict(X.iloc[[i]])
            y_pred.append(pred)
        
        y_pred = np.array(y_pred)
        
        # Calculate metrics
        r2 = r2_score(y_true, y_pred)
        mae = mean_absolute_error(y_true, y_pred)
        rmse = np.sqrt(mean_squared_error(y_true, y_pred))
        
        # Status emoji
        if r2 >= 0.85:
            status = "✅"
        elif r2 >= 0.70:
            status = "⚠️"
        else:
            status = "❌"
        
        print(f"\n{status} Results:")
        print(f"   R² Score:  {r2*100:.2f}%")
        print(f"   MAE:       {mae:.2f}")
        print(f"   RMSE:      {rmse:.2f}")
        
        return r2
        
    except Exception as e:
        print(f"❌ Error testing {domain}: {e}")
        import traceback
        traceback.print_exc()
        return None


def main():
    """Run accuracy tests on all domains"""
    print("\n" + "="*70)
    print("ML MODEL ACCURACY TEST")
    print("="*70)
    
    # Load features
    features_path = os.path.join('app', 'ml', 'data', 'features.csv')
    
    if not os.path.exists(features_path):
        print(f"❌ Features file not found: {features_path}")
        return
    
    print(f"\nLoading data from: {features_path}")
    features_df = pd.read_csv(features_path)
    print(f"✅ Loaded {len(features_df):,} samples")
    
    # Test each domain
    domains = ['ecom', 'finance', 'food', 'mobility']
    results = {}
    
    for domain in domains:
        r2 = test_domain_accuracy(domain, features_df)
        if r2 is not None:
            results[domain] = r2
    
    # Summary
    if results:
        print(f"\n{'='*70}")
        print("SUMMARY")
        print(f"{'='*70}")
        
        for domain, r2 in results.items():
            status = "✅" if r2 >= 0.85 else "⚠️" if r2 >= 0.70 else "❌"
            print(f"{status} {domain.upper():<12}: {r2*100:.2f}%")
        
        avg_r2 = np.mean(list(results.values()))
        avg_status = "✅" if avg_r2 >= 0.85 else "⚠️" if avg_r2 >= 0.70 else "❌"
        
        print(f"\n{avg_status} AVERAGE: {avg_r2*100:.2f}%")
        
        # Decision
        print("\n" + "="*70)
        if avg_r2 >= 0.85:
            print("✅ READY TO DEPLOY - All models performing well")
        elif avg_r2 >= 0.70:
            print("⚠️  CAUTION - Models acceptable but could be better")
        else:
            print("❌ DO NOT DEPLOY - Models underperforming")
        print("="*70)
    else:
        print("\n❌ No results to display")


if __name__ == "__main__":
    main()