import {getOrderSummary,productIdentity,isShoe,isGiftSet,orderStockLimit,isCombo,buildComboProducts,cartProductLimit} from './catalog-model.mjs?v=20261106-combos';
window.SkuOrderModel={summary:getOrderSummary,identity:productIdentity,isShoe,isGiftSet,stockLimit:orderStockLimit,isCombo,combos:buildComboProducts,cartLimit:cartProductLimit};
