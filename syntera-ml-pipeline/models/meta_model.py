"""
Meta-Model Training
Trains meta-model that learns optimal combination of 5 base models
"""

import sys
import os
import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
import joblib

# Add backend to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../../backend')))


class MetaModelTrainer:
    """
    Train meta-model that learns optimal combination of base models
    """
    
    def __init__(self, domain):
        self.domain = domain
        self.meta_model = None
        self.base_models = {}
        self.feature_columns = None
        
    def load_base_models(self, model_dir='saved'):
        """Load all 5 base models for this domain"""
        # Create absolute path
        base_path = os.path.dirname(__file__)
        full_model_dir = os.path.join(base_path, model_dir)
        
        model_names = ['xgboost', 'lightgbm', 'catboost', 'random_forest', 'neural_net']
        
        print(f"\n{'='*60}")
        print(f"Loading base models for {self.domain.upper()}")
        print(f"{'='*60}")
        
        for name in model_names:
            filepath = os.path.join(full_model_dir, f"{self.domain}_{name}.joblib")
            if os.path.exists(filepath):
                self.base_models[name] = joblib.load(filepath)
                print(f"✅ Loaded: {name}")
            else:
                print(f"⚠️  Not found: {name}")
        
        # Load feature columns
        feature_file = os.path.join(full_model_dir, f"{self.domain}_features.joblib")
        if os.path.exists(feature_file):
            self.feature_columns = joblib.load(feature_file)
            print(f"✅ Loaded: feature columns ({len(self.feature_columns)} features)")
        
        if len(self.base_models) < 5:
            raise ValueError(f"Only found {len(self.base_models)}/5 base models for {self.domain}")
    
    def generate_meta_features(self, X):
        """
        Generate meta-features: predictions from all 5 base models
        
        Args:
            X: Input features (n_samples, n_features)
        
        Returns:
            Meta-features (n_samples, 5) - one prediction per base model
        """
        meta_features = []
        
        for name in ['xgboost', 'lightgbm', 'catboost', 'random_forest', 'neural_net']:
            if name in self.base_models:
                predictions = self.base_models[name].predict(X)
                meta_features.append(predictions)
        
        # Stack predictions: shape (n_samples, 5)
        return np.column_stack(meta_features)
    
    def train(self, X_train, y_train, X_val, y_val):
        """
        Train meta-model on base model predictions
        
        Args:
            X_train: Training features
            y_train: Training targets
            X_val: Validation features
            y_val: Validation targets
        """
        print(f"\n{'='*60}")
        print(f"Training Meta-Model for {self.domain.upper()}")
        print(f"{'='*60}")
        
        # Generate meta-features from base models
        print("Generating meta-features from base models...")
        meta_X_train = self.generate_meta_features(X_train)
        meta_X_val = self.generate_meta_features(X_val)
        
        print(f"Meta-features shape: {meta_X_train.shape}")
        print(f"   (5 predictions from 5 base models)")
        
        # Train meta-model (gradient boosting)
        print("\n🚀 Training Gradient Boosting Meta-Model...")
        self.meta_model = GradientBoostingRegressor(
            n_estimators=100,
            max_depth=3,
            learning_rate=0.1,
            random_state=42
        )
        
        self.meta_model.fit(meta_X_train, y_train)
        
        # Evaluate
        train_pred = self.meta_model.predict(meta_X_train)
        val_pred = self.meta_model.predict(meta_X_val)
        
        train_mae = mean_absolute_error(y_train, train_pred)
        val_mae = mean_absolute_error(y_val, val_pred)
        val_rmse = np.sqrt(mean_squared_error(y_val, val_pred))
        val_r2 = r2_score(y_val, val_pred)
        
        print(f"\n✅ Meta-Model Performance:")
        print(f"   Train MAE:  {train_mae:.4f}")
        print(f"   Val MAE:    {val_mae:.4f}")
        print(f"   Val RMSE:   {val_rmse:.4f}")
        print(f"   Val R²:     {val_r2:.4f}")
        
        # Show learned weights (feature importances)
        print(f"\n📊 Learned Model Weights (Feature Importances):")
        model_names = ['XGBoost', 'LightGBM', 'CatBoost', 'RandomForest', 'NeuralNet']
        importances = self.meta_model.feature_importances_
        
        for name, weight in zip(model_names, importances):
            print(f"   {name:<15}: {weight:.3f}")
        
        return val_mae
    
    def predict(self, X):
        """
        Make prediction using meta-model
        
        Args:
            X: Input features
        
        Returns:
            Final prediction (meta-model output)
        """
        # Generate meta-features
        meta_features = self.generate_meta_features(X)
        
        # Meta-model prediction
        return self.meta_model.predict(meta_features)
    
    def save(self, output_dir='saved'):
        """Save meta-model"""
        base_path = os.path.dirname(__file__)
        full_output_dir = os.path.join(base_path, output_dir)
        os.makedirs(full_output_dir, exist_ok=True)
        
        filepath = os.path.join(full_output_dir, f"{self.domain}_meta_model.joblib")
        joblib.dump(self.meta_model, filepath)
        print(f"\n✅ Saved meta-model: {os.path.basename(filepath)}")


def train_all_meta_models(features_df, output_dir='saved'):
    """
    Train meta-models for all domains
    """
    from models.base_models import BaseModelTrainer
    
    domains = features_df['domain'].unique()
    
    print("\n" + "="*70)
    print("TRAINING META-MODELS FOR ALL DOMAINS")
    print("="*70)
    
    for domain in domains:
        print(f"\n{'#'*70}")
        print(f"# DOMAIN: {domain.upper()}")
        print(f"{'#'*70}")
        
        # Get domain data
        domain_data = features_df[features_df['domain'] == domain]
        
        if len(domain_data) < 50:
            print(f"⚠️  Insufficient data for {domain}")
            continue
        
        try:
            # Prepare data (same as base model training)
            trainer = BaseModelTrainer(domain)
            X_train, X_test, y_train, y_test = trainer.prepare_data(features_df)
            
            # Train meta-model
            meta_trainer = MetaModelTrainer(domain)
            meta_trainer.load_base_models(output_dir)
            meta_trainer.train(X_train, y_train, X_test, y_test)
            meta_trainer.save(output_dir)
            
        except Exception as e:
            print(f"\n❌ Error training meta-model for {domain}: {str(e)}")
            continue


if __name__ == "__main__":
    print("\n" + "="*70)
    print("SYNTERA ML PIPELINE - META-MODEL TRAINING")
    print("="*70)
    
    # Load features
    features_path = os.path.join(os.path.dirname(__file__), '..', 'data', 'features.csv')
    
    if not os.path.exists(features_path):
        print(f"\n❌ Error: {features_path} not found!")
        print("Run 'python features/feature_engineering.py' first")
        exit(1)
    
    features_df = pd.read_csv(features_path)
    
    # Train all meta-models
    train_all_meta_models(features_df)
    
    print("\n" + "="*70)
    print("✅ META-MODEL TRAINING COMPLETE!")
    print("="*70)
    print("\nNext step: Test predictions with 'python models/predict.py'")