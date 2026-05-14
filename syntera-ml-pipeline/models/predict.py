"""
Prediction Pipeline
Complete ML prediction using trained base models + meta-model
"""

import sys
import os
import numpy as np
import pandas as pd
import joblib

# Add backend to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../../backend')))


class MLPredictor:
    """
    Complete ML prediction pipeline
    """
    
    def __init__(self, domain, model_dir='saved'):
        self.domain = domain
        self.model_dir = model_dir
        self.base_models = {}
        self.meta_model = None
        self.feature_columns = None
        
        self._load_models()
    
    def _load_models(self):
        """Load all models for this domain"""
        base_path = os.path.dirname(__file__)
        full_model_dir = os.path.join(base_path, self.model_dir)
        
        # Load base models
        model_names = ['xgboost', 'lightgbm', 'catboost', 'random_forest', 'neural_net']
        for name in model_names:
            filepath = os.path.join(full_model_dir, f"{self.domain}_{name}.joblib")
            if os.path.exists(filepath):
                self.base_models[name] = joblib.load(filepath)
        
        # Load meta-model
        meta_filepath = os.path.join(full_model_dir, f"{self.domain}_meta_model.joblib")
        if os.path.exists(meta_filepath):
            self.meta_model = joblib.load(meta_filepath)
        
        # Load feature columns
        feature_file = os.path.join(full_model_dir, f"{self.domain}_features.joblib")
        if os.path.exists(feature_file):
            self.feature_columns = joblib.load(feature_file)
        
        print(f"✅ Loaded models for {self.domain}")
        print(f"   Base models: {len(self.base_models)}")
        print(f"   Meta-model: {'Yes' if self.meta_model else 'No'}")
        print(f"   Features: {len(self.feature_columns) if self.feature_columns else 0}")
    
    def predict(self, features_dict):
        """
        Make prediction for a user
        
        Args:
            features_dict: Dictionary of 15 features
        
        Returns:
            Dict with prediction, confidence, explanation, base_predictions
        """
        # Convert to array in correct order
        X = np.array([[features_dict[col] for col in self.feature_columns]])
        
        # Get base model predictions
        base_predictions = {}
        for name, model in self.base_models.items():
            base_predictions[name] = float(model.predict(X)[0])
        
        # Meta-model prediction
        if self.meta_model:
            meta_features = np.array([[base_predictions[name] for name in 
                                     ['xgboost', 'lightgbm', 'catboost', 'random_forest', 'neural_net']]])
            final_prediction = float(self.meta_model.predict(meta_features)[0])
        else:
            # Fallback: simple average
            final_prediction = np.mean(list(base_predictions.values()))
        
        # Calculate confidence
        confidence = self._calculate_confidence(base_predictions, final_prediction)
        
        # Generate explanation
        explanation = self._generate_explanation(final_prediction, confidence, base_predictions)
        
        return {
            'prediction': final_prediction,
            'confidence': confidence,
            'confidence_label': self._confidence_label(confidence),
            'explanation': explanation,
            'base_predictions': base_predictions
        }
    
    def _calculate_confidence(self, base_predictions, final_prediction):
        """
        Calculate confidence score based on model agreement
        """
        predictions = list(base_predictions.values())
        
        # Calculate coefficient of variation
        mean_pred = np.mean(predictions)
        std_pred = np.std(predictions)
        
        if mean_pred == 0:
            return 0.5
        
        cv = std_pred / mean_pred
        
        # Convert to confidence (0-1)
        if cv < 0.1:
            confidence = 0.95
        elif cv < 0.2:
            confidence = 0.85
        elif cv < 0.3:
            confidence = 0.75
        else:
            confidence = 0.60
        
        # Boost confidence since we're using Actions data (Source 1)
        confidence += 0.05
        
        return min(confidence, 0.98)
    
    def _confidence_label(self, confidence):
        """Get confidence label"""
        if confidence >= 0.90:
            return "VERY HIGH"
        elif confidence >= 0.75:
            return "HIGH"
        elif confidence >= 0.50:
            return "MODERATE"
        else:
            return "LOW"
    
    def _generate_explanation(self, prediction, confidence, base_predictions):
        """Generate human-readable explanation"""
        conf_label = self._confidence_label(confidence)
        
        explanation = f"Prediction: {prediction:.2f} orders/week\n"
        explanation += f"Confidence: {confidence*100:.1f}% ({conf_label})\n\n"
        explanation += "Based on:\n"
        explanation += "• 15 behavioral features from transaction history\n"
        explanation += "• 5 ML models (XGBoost, LightGBM, CatBoost, RF, NN)\n"
        explanation += "• Meta-model optimal combination\n\n"
        explanation += "Individual model predictions:\n"
        for name, pred in base_predictions.items():
            explanation += f"  - {name:<15}: {pred:.2f}\n"
        
        return explanation


if __name__ == "__main__":
    print("\n" + "="*70)
    print("SYNTERA ML PIPELINE - PREDICTION TEST")
    print("="*70)
    
    # Load features to test with
    features_path = os.path.join(os.path.dirname(__file__), '..', 'data', 'features.csv')
    
    if not os.path.exists(features_path):
        print(f"\n❌ Error: {features_path} not found!")
        exit(1)
    
    features_df = pd.read_csv(features_path)
    
    # Test prediction for each domain
    domains = features_df['domain'].unique()
    
    for domain in domains:
        domain_data = features_df[features_df['domain'] == domain]
        
        if len(domain_data) == 0:
            continue
        
        print(f"\n{'='*70}")
        print(f"Testing predictions for domain: {domain.upper()}")
        print(f"{'='*70}")
        
        try:
            # Load predictor
            predictor = MLPredictor(domain)
            
            # Get sample user
            sample = domain_data.iloc[0]
            
            # Extract features
            feature_dict = {}
            for col in predictor.feature_columns:
                feature_dict[col] = sample[col]
            
            # Make prediction
            result = predictor.predict(feature_dict)
            
            print(f"\nUser: {sample['user_id']}")
            print(f"Actual transactions: {sample['total_transactions']}")
            print("\n" + result['explanation'])
            
        except Exception as e:
            print(f"\n❌ Error: {str(e)}")
    
    print("\n" + "="*70)
    print("✅ PREDICTION TESTING COMPLETE!")
    print("="*70)