# WindTank — Đại Chiến Xe Tăng Mê Cung (Local 2–4 Xe, AI 4 Cấp Độ, Mobile Cảm Ứng & Online 1vs1 P2P)

Game bắn tăng mê cung phong cách **Tank Trouble** viết bằng **Phaser 3**, **TypeScript** và **Vite** (100% đồ họa Canvas2D thủ tục & âm thanh Web Audio API, triển khai tĩnh miễn phí trên Vercel / GitHub Pages / Cloudflare Pages).

## Tính năng nổi bật

- **Đấu Online 1vs1 Miễn Phí theo Mã Phòng (`🌐 ONLINE 1VS1`):**
  - Kết nối ngang hàng **PeerJS Cloud + STUN Google/Cloudflare** thuần trình duyệt (không cần tự dựng backend, không ghép phòng ngẫu nhiên).
  - Tạo **Mã Phòng 6 ký tự (`WT-XXXX`)** hoặc **Sao Chép Link Mời (`?room=WT-XXXX`)** gửi bạn bè vào phòng đấu ngay kèm đồng bộ trạng thái 30Hz, nội suy mượt và hiển thị `Ping (ms)`.
- **Tối Ưu Giao Diện & Cơ Chế Lái Trên Mobile:**
  - Tự động nhận diện thiết bị cảm ứng (hoặc bật/tắt thủ công trong `Cài Đặt`), thu gọn bảng điểm đáy thành **Thanh Điểm Gọn Trên Đỉnh** và mở rộng mê cung dọc với 2 hành lang ngón cái trái/phải không che khuất bản đồ.
  - **2 kiểu điều khiển Mobile:** **Cần Gạt Thông Minh (`Vector Stick`)** (vùng kéo nhẹ `14%–42%` xoay nòng ngắm tại chỗ, kéo `>=42%` tự rẽ & tiến, kéo ngược `>130°` hoặc bấm nút `LÙI` để lùi khẩn cấp) + nút `BẮN!` cỡ lớn tích hợp vòng hiển thị đạn/năng lượng kỹ năng; hoặc **Cụm Phím Cổ Điển (`Dual-Pad`)**.
- **2–4 Xe Cùng Màn Hình & Máy AI 4 Cấp Độ (`Dễ`, `Bình Thường`, `Khó`, `Siêu Khó`):**
  - Tuỳ chỉnh từng xe là Người Chơi hoặc Máy AI ngay trên thẻ sảnh chờ hoặc chỉnh trực tiếp trong trận qua `⚙ Luật Chơi`.
- **10 Kỹ Năng Giáp Siêu Nhân Trong Thùng Gỗ Bí Ẩn:**
  1. **Pháo Chùm Hải Tặc (`15%`):** 3 loạt × 5 viên đạn quạt `±18°` kèm lực giật chiến thuật.
  2. **Đạn Liên Thanh (`14%`):** 20 viên tốc độ cao kèm độ giật lùi thân xe & độ lệch nòng.
  3. **Mìn Bóng Ma (`13%`):** 3 quả mìn cảm ứng tự tàng hình sau `1.6s`.
  4. **Hỏa Long Phun Lửa (`12%`):** 80 nhịp phun lửa kép siêu dày tầm xa dọc hành lang, trượt tường & thiêu rụi đạn địch.
  5. **Đạn Gai Sắt (`11%`):** Nảy tường `3s` rồi nổ tung 16 gai sắt + bẫy gai mặt đất `5s`.
  6. **Mũi Khoan Địa Chấn (`10%`):** 2 mũi khoan xoắn ốc cơ khí đục thủng tối đa 4 bức tường nội khu mỗi phát.
  7. **Khiên Từ Trường (`9%`):** Vòm hộ thể `5.5s` phản ngược đạn địch và chặn Laser/Lưỡi Hái/Mìn/Gai.
  8. **Đạn Định Vị (`8%`):** Nảy `4s` đầu rồi bật radar BFS tìm đường ngắn nhất tới xe gần nhất.
  9. **Laser Siêu Cấp (`5%`):** Tụ lực `2s` rồi bắn tia plasma xoắn kép xanh dương xuyên toàn bản đồ.
  10. **Lưỡi Hái Tử Thần (`3%`):** Đại lưỡi liềm **Đỏ - Đen** dài `4.7` ô xuyên tường, xoay trầm hùng **`180°`** quét sạch vòng tròn quanh xe.

## Lệnh chạy & kiểm thử

```bash
npm install
npm run dev
npm run build
npm run test:unit
npm run test:e2e
```
